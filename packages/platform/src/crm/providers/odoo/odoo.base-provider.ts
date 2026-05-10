import { CrmProviderType } from "@ringee/database";
import { AbstractCrmProvider } from "../../abstract-provider";
import { CrmError } from "../../errors";
import type {
  CrmAuthorizeParams,
  CrmCallLogInput,
  CrmCapabilities,
  CrmCompanyInput,
  CrmCompanyMatch,
  CrmCompanySyncResult,
  CrmContactSyncResult,
  CrmCredentials,
  CrmExchangeParams,
  CrmMeetingInput,
  CrmMeetingSyncResult,
  CrmNoteInput,
  CrmOwnerRef,
  CrmPagedResult,
  CrmPersonInput,
  CrmRecordMatch,
  CrmRecordRef,
  CrmRecordingUploadInput,
  CrmRecordingUploadResult,
  CrmTaskInput,
  CrmTokenSet,
  CrmWorkspaceInfo,
} from "../../types";
import { ODOO_CAPABILITIES } from "./odoo.capabilities";
import { buildOdooCallLog } from "./odoo.call-log";
import { buildOdooMeetingLog } from "./odoo.meeting-log";
import { parseOdooCredentials } from "./odoo.credentials";
import {
  mapOdooCompanyToMatch,
  mapOdooCompanyToSyncResult,
  mapOdooPartnerToMatch,
  mapOdooPartnerToSyncResult,
  mapOdooUserToOwnerRef,
} from "./odoo.mapper";
import type {
  OdooApiMode,
  OdooCredentialPayload,
  OdooPartnerRecord,
  OdooUserRecord,
} from "./odoo.types";

/**
 * Shared base for both Odoo providers.
 *
 * Subclasses implement the single Odoo RPC primitive,
 * `callModel(creds, model, method, args, kwargs)`, and `authenticate()`
 * (a no-op for JSON-2, a real RPC login for 14–18). Everything else —
 * matching, upsert, call logging, notes, tasks — is shared.
 */
export abstract class OdooBaseProvider extends AbstractCrmProvider {
  abstract readonly type: CrmProviderType;
  abstract readonly mode: OdooApiMode;
  readonly capabilities: CrmCapabilities = ODOO_CAPABILITIES;

  protected readonly partnerFields = [
    "id",
    "name",
    "display_name",
    "email",
    "phone",
    "mobile",
    "is_company",
    "company_name",
    "parent_id",
    "function",
    "user_id",
    "website",
    "industry_id",
  ];

  /**
   * Per-connection cache of which fields actually exist on a model.
   * Odoo deployments vary: `mobile` on `res.partner`, `industry_id`,
   * `company_name`, etc. may be absent depending on installed modules.
   * We read once via `fields_get` and filter subsequent queries to
   * avoid "Invalid field <model>.<field>" errors.
   */
  private readonly fieldsCache = new Map<string, Set<string>>();

  protected async getModelFields(
    creds: OdooCredentialPayload,
    model: string,
  ): Promise<Set<string>> {
    const key = `${creds.baseUrl}#${creds.database}#${model}`;
    const cached = this.fieldsCache.get(key);
    if (cached) return cached;
    try {
      const result = await this.callModel<Record<string, unknown>>(
        creds,
        model,
        "fields_get",
        [[]],
        { attributes: ["type"] },
      );
      const set = new Set(Object.keys(result ?? {}));
      this.fieldsCache.set(key, set);
      return set;
    } catch {
      // If fields_get itself fails we return an empty set — callers
      // should fall back to a minimal, guaranteed-to-exist field list.
      return new Set();
    }
  }

  protected async resolvePartnerFields(
    creds: OdooCredentialPayload,
  ): Promise<string[]> {
    const available = await this.getModelFields(creds, "res.partner");
    if (available.size === 0) {
      // Minimal fallback: fields that exist on every modern Odoo.
      return ["id", "name", "display_name", "email", "phone", "is_company"];
    }
    return this.partnerFields.filter((f) => available.has(f));
  }

  /**
   * Build a domain that matches phoneE164 (or its last-9-digit suffix)
   * across whichever phone-like fields the server actually exposes.
   * Returns null when no phone fields are available (caller should
   * short-circuit to "no matches").
   */
  protected async buildPhoneDomain(
    creds: OdooCredentialPayload,
    phoneE164: string,
  ): Promise<unknown[] | null> {
    const available = await this.getModelFields(creds, "res.partner");
    const hasPhone = available.size === 0 || available.has("phone");
    const hasMobile = available.has("mobile");

    const fields: string[] = [];
    if (hasPhone) fields.push("phone");
    if (hasMobile) fields.push("mobile");
    if (fields.length === 0) return null;

    const suffix = phoneE164.replace(/\D/g, "").slice(-9);
    const leaves: unknown[] = [];
    for (const f of fields) leaves.push([f, "=", phoneE164]);
    if (suffix) {
      for (const f of fields) leaves.push([f, "ilike", suffix]);
    }
    // Prefix the leaves with n-1 OR operators (Odoo's prefix-notation for n-ary OR).
    const ors: unknown[] = [];
    for (let i = 0; i < leaves.length - 1; i++) ors.push("|");
    return [...ors, ...leaves];
  }

  // ── Primitive (subclass-provided) ────────────────────────────────────
  protected abstract authenticate(creds: OdooCredentialPayload): Promise<number>;

  protected abstract callModel<T = unknown>(
    creds: OdooCredentialPayload,
    model: string,
    method: string,
    args: unknown[],
    kwargs?: Record<string, unknown>,
  ): Promise<T>;

  // ── OAuth stubs (unused for Odoo) ────────────────────────────────────
  getAuthorizationUrl(_params: CrmAuthorizeParams): string {
    throw new CrmError(
      "VALIDATION",
      false,
      "Odoo uses credential-based authentication, not OAuth",
    );
  }

  exchangeCode(_params: CrmExchangeParams): Promise<CrmTokenSet> {
    return Promise.reject(
      new CrmError(
        "VALIDATION",
        false,
        "Odoo uses credential-based authentication, not OAuth",
      ),
    );
  }

  refreshToken(_refreshToken: string): Promise<CrmTokenSet> {
    return Promise.reject(
      new CrmError(
        "VALIDATION",
        false,
        "Odoo credentials do not expire; re-validate instead",
      ),
    );
  }

  // ── Identity ─────────────────────────────────────────────────────────
  async getWorkspaceInfo(creds: CrmCredentials): Promise<CrmWorkspaceInfo> {
    const odooCreds = parseOdooCredentials(creds);
    const uid = await this.authenticate(odooCreds);

    // Get the active company of the authenticated user.
    const info = await this.callModel<
      Array<{ id: number; name: string; company_id?: [number, string] | false }>
    >(odooCreds, "res.users", "read", [[uid]], {
      fields: ["id", "name", "login", "company_id"],
    });
    const user = info?.[0];
    const companyId = user?.company_id && Array.isArray(user.company_id) ? user.company_id[0] : null;
    const companyName = user?.company_id && Array.isArray(user.company_id) ? user.company_id[1] : null;

    return {
      accountId: `${odooCreds.baseUrl}#${odooCreds.database}`,
      accountName: companyName ?? odooCreds.database,
      metadata: {
        mode: this.mode,
        baseUrl: odooCreds.baseUrl,
        database: odooCreds.database,
        uid,
        companyId,
        companyName,
      },
    };
  }

  // ── Matching ─────────────────────────────────────────────────────────
  async searchByPhone(
    creds: CrmCredentials,
    phoneE164: string,
    opts: { limit?: number } = {},
  ): Promise<CrmRecordMatch[]> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);

    const domain = await this.buildPhoneDomain(odooCreds, phoneE164);
    if (!domain) return [];
    const fields = await this.resolvePartnerFields(odooCreds);
    const records = await this.callModel<OdooPartnerRecord[]>(
      odooCreds,
      "res.partner",
      "search_read",
      [domain],
      { fields, limit: opts.limit ?? 10 },
    );
    return (records ?? []).map((r) => mapOdooPartnerToMatch(r, phoneE164));
  }

  async searchByEmail(
    creds: CrmCredentials,
    email: string,
    opts: { limit?: number } = {},
  ): Promise<CrmRecordMatch[]> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);
    const fields = await this.resolvePartnerFields(odooCreds);
    const records = await this.callModel<OdooPartnerRecord[]>(
      odooCreds,
      "res.partner",
      "search_read",
      [[["email", "=ilike", email]]],
      { fields, limit: opts.limit ?? 10 },
    );
    return (records ?? []).map((r) => mapOdooPartnerToMatch(r, ""));
  }

  async searchCompanyByDomain(
    creds: CrmCredentials,
    domain: string,
  ): Promise<CrmCompanyMatch[]> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);
    const fields = await this.resolvePartnerFields(odooCreds);
    const records = await this.callModel<OdooPartnerRecord[]>(
      odooCreds,
      "res.partner",
      "search_read",
      [[
        ["is_company", "=", true],
        "|",
        ["website", "ilike", domain],
        ["website", "=", `https://${domain}`],
      ]],
      { fields, limit: 10 },
    );
    return (records ?? []).map((r) => mapOdooCompanyToMatch(r, domain));
  }

  // ── Upsert ───────────────────────────────────────────────────────────
  async upsertPerson(creds: CrmCredentials, input: CrmPersonInput): Promise<CrmRecordRef> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);
    const available = await this.getModelFields(odooCreds, "res.partner");
    const has = (f: string) => available.size === 0 || available.has(f);

    let existingId: number | null = null;
    if (input.email) {
      const found = await this.callModel<number[]>(
        odooCreds,
        "res.partner",
        "search",
        [[
          ["email", "=ilike", input.email],
          ["is_company", "=", false],
        ]],
        { limit: 1 },
      );
      existingId = found?.[0] ?? null;
    }
    if (!existingId) {
      const phoneDomain = await this.buildPhoneDomain(odooCreds, input.phoneE164);
      if (phoneDomain) {
        const found = await this.callModel<number[]>(
          odooCreds,
          "res.partner",
          "search",
          [phoneDomain],
          { limit: 1 },
        );
        existingId = found?.[0] ?? null;
      }
    }

    // Compose a *human* name from the inputs (first+last or displayName or
    // email local-part). Does not include the phone number fallback —
    // that one is only used on create, never to overwrite an existing
    // Odoo partner's real name.
    const composed = [input.firstName, input.lastName]
      .filter((p): p is string => Boolean(p && p.trim()))
      .join(" ")
      .trim();
    const emailLocal = input.email ? input.email.split("@")[0] : "";
    const humanName =
      (input.displayName && input.displayName.trim()) || composed || emailLocal || "";

    if (existingId) {
      // Write path: only touch fields where we have better data — never
      // overwrite an existing partner's name, phone, or email with
      // inferior/empty inputs.
      const vals: Record<string, unknown> = {};
      if (humanName) vals.name = humanName;
      if (input.email && has("email")) vals.email = input.email;
      if (input.company && has("company_name")) vals.company_name = input.company;
      // Phone is intentionally not written on update — existing Odoo users
      // often hand-curate partner numbers and we'd rather append via a
      // separate workflow than clobber.
      if (Object.keys(vals).length > 0) {
        await this.callModel(odooCreds, "res.partner", "write", [[existingId], vals]);
      }
      return { externalId: String(existingId), externalType: "person" };
    }

    // Create path: Odoo requires res.partner.name, so use the phone number
    // as the last-resort fallback for anonymous inbound callers.
    const name = humanName || input.phoneE164;
    const vals: Record<string, unknown> = {
      is_company: false,
      name,
    };
    if (has("phone")) vals.phone = input.phoneE164;
    if (input.email) vals.email = input.email;
    if (input.company && has("company_name")) vals.company_name = input.company;

    const created = await this.callModel<number>(odooCreds, "res.partner", "create", [vals]);
    return { externalId: String(created), externalType: "person" };
  }

  async upsertCompany(creds: CrmCredentials, input: CrmCompanyInput): Promise<CrmRecordRef> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);
    const available = await this.getModelFields(odooCreds, "res.partner");
    const has = (f: string) => available.size === 0 || available.has(f);

    const nameTrimmed = (input.name ?? "").trim();
    if (!nameTrimmed && !input.domain) {
      throw new CrmError(
        "VALIDATION",
        false,
        "odoo company requires a name or domain",
      );
    }
    const resolvedName = nameTrimmed || (input.domain ?? "Unnamed company");

    let existingId: number | null = null;
    if (input.domain && has("website")) {
      const found = await this.callModel<number[]>(
        odooCreds,
        "res.partner",
        "search",
        [[
          ["is_company", "=", true],
          ["website", "ilike", input.domain],
        ]],
        { limit: 1 },
      );
      existingId = found?.[0] ?? null;
    }
    if (!existingId && nameTrimmed) {
      const found = await this.callModel<number[]>(
        odooCreds,
        "res.partner",
        "search",
        [[
          ["is_company", "=", true],
          ["name", "=ilike", nameTrimmed],
        ]],
        { limit: 1 },
      );
      existingId = found?.[0] ?? null;
    }

    if (existingId) {
      // Write path: only populate fields we actually have new data for.
      const vals: Record<string, unknown> = {};
      if (nameTrimmed) vals.name = nameTrimmed;
      if (input.domain && has("website")) vals.website = `https://${input.domain}`;
      if (Object.keys(vals).length > 0) {
        await this.callModel(odooCreds, "res.partner", "write", [[existingId], vals]);
      }
      return { externalId: String(existingId), externalType: "company" };
    }

    const vals: Record<string, unknown> = {
      is_company: true,
      name: resolvedName,
    };
    if (input.domain && has("website")) vals.website = `https://${input.domain}`;
    if (input.phoneE164 && has("phone")) vals.phone = input.phoneE164;

    const created = await this.callModel<number>(odooCreds, "res.partner", "create", [vals]);
    return { externalId: String(created), externalType: "company" };
  }

  // ── Logging ──────────────────────────────────────────────────────────
  async logCall(creds: CrmCredentials, input: CrmCallLogInput): Promise<CrmRecordRef> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);

    let target = input.linkedRecords[0];
    if (!target && input.needsPersonCreation) {
      target = await this.upsertPerson(creds, {
        displayName: input.needsPersonCreation.displayName,
        firstName: input.needsPersonCreation.firstName,
        lastName: input.needsPersonCreation.lastName,
        email: input.needsPersonCreation.email,
        phoneE164: input.needsPersonCreation.phoneE164,
      });
    }
    if (!target) {
      throw new CrmError("NOT_FOUND", false, "no linked record and no creation data");
    }

    const resModel = target.externalType === "company" ? "res.partner" : "res.partner";
    const resId = Number(target.externalId);
    const { body, activitySummary, activityNote } = buildOdooCallLog(input);

    // 1) Post the full call log into the chatter (persisted record).
    await this.callModel(odooCreds, resModel, "message_post", [[resId]], {
      body,
      subject: activitySummary,
      message_type: "comment",
      subtype_xmlid: "mail.mt_note",
    });

    // 2) Also create a completed `mail.activity` for consistency with
    //    Odoo's CRM workflow. We fail silently if the activity model is
    //    not available on this DB to avoid blocking the main log.
    try {
      const activityTypeId = await this.resolveCallActivityTypeId(odooCreds);
      const modelId = await this.resolveIrModelId(odooCreds, resModel);
      const activityVals: Record<string, unknown> = {
        res_model: resModel,
        res_model_id: modelId,
        res_id: resId,
        summary: activitySummary,
        note: activityNote,
      };
      if (activityTypeId) activityVals.activity_type_id = activityTypeId;
      const activityId = await this.callModel<number>(
        odooCreds,
        "mail.activity",
        "create",
        [activityVals],
      );
      // Mark as done so it shows up in the past-activities timeline.
      await this.callModel(
        odooCreds,
        "mail.activity",
        "action_feedback",
        [[activityId]],
        { feedback: activitySummary },
      ).catch(() => {
        // Not all versions expose action_feedback; the activity still exists.
      });
    } catch (err) {
      this.logger.warn(
        `mail.activity creation skipped for call ${input.idempotencyKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return target;
  }

  async addNote(creds: CrmCredentials, input: CrmNoteInput): Promise<CrmRecordRef> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);
    const resId = Number(input.recordId);
    // Auto-link bare URLs (e.g. the recording URL callback posts the
    // raw link as body text) so the chatter entry is clickable.
    const bodyHtml = linkifyBareUrls(input.body);
    const body = input.title
      ? `<p><strong>${escapeHtml(input.title)}</strong></p>${bodyHtml}`
      : bodyHtml;
    await this.callModel(odooCreds, "res.partner", "message_post", [[resId]], {
      body,
      subject: input.title ?? "Note from Ringee",
      message_type: "comment",
      subtype_xmlid: "mail.mt_note",
    });
    return { externalId: input.recordId, externalType: input.recordType };
  }

  async createTask(creds: CrmCredentials, input: CrmTaskInput): Promise<CrmRecordRef> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);

    const target = input.linkedRecords[0];
    if (!target) {
      throw new CrmError("VALIDATION", false, "odoo task requires at least one linked record");
    }
    const resModel = "res.partner";
    const resId = Number(target.externalId);

    const modelId = await this.resolveIrModelId(odooCreds, resModel);
    const vals: Record<string, unknown> = {
      res_model: resModel,
      res_model_id: modelId,
      res_id: resId,
      summary: input.title,
      note: input.body ?? "",
      date_deadline: input.dueAt
        ? input.dueAt.toISOString().slice(0, 10)
        : new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10),
    };

    if (input.assigneeEmail) {
      try {
        const userIds = await this.callModel<number[]>(
          odooCreds,
          "res.users",
          "search",
          [[["login", "=", input.assigneeEmail]]],
          { limit: 1 },
        );
        if (userIds?.[0]) vals.user_id = userIds[0];
      } catch {
        // non-fatal; fall back to default assignee
      }
    }

    const created = await this.callModel<number>(odooCreds, "mail.activity", "create", [vals]);
    return { externalId: String(created), externalType: target.externalType };
  }

  // ── Meeting ──────────────────────────────────────────────────────────────────
  async upsertMeeting(creds: CrmCredentials, input: CrmMeetingInput): Promise<CrmMeetingSyncResult> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);

    const target = input.linkedRecords[0];
    if (!target) {
      throw new CrmError("VALIDATION", false, "meeting sync requires at least one linked record");
    }

    const resModel = "res.partner";
    const resId = Number(target.externalId);
    const { body, activitySummary, activityNote } = buildOdooMeetingLog(input);
    const idempotencyTag = `[ringee:${input.idempotencyKey}]`;

    // Idempotency: check if a chatter message with this tag already exists
    try {
      const existing = await this.callModel<number[]>(
        odooCreds,
        "mail.message",
        "search",
        [[
          ["model", "=", resModel],
          ["res_id", "=", resId],
          ["body", "ilike", idempotencyTag],
        ]],
        { limit: 1 },
      );
      if (existing && existing.length > 0) {
        return {
          ref: { externalId: String(resId), externalType: target.externalType },
          syncMode: "crm_activity_with_note",
        };
      }
    } catch {
      // Non-fatal: if search fails, proceed to create
    }

    // 1) Post the meeting details into the chatter.
    await this.callModel(odooCreds, resModel, "message_post", [[resId]], {
      body,
      subject: activitySummary,
      message_type: "comment",
      subtype_xmlid: "mail.mt_note",
    });

    // 2) Create a completed mail.activity for the CRM workflow.
    try {
      const activityTypeId = await this.resolveMeetingActivityTypeId(odooCreds);
      const modelId = await this.resolveIrModelId(odooCreds, resModel);
      const activityVals: Record<string, unknown> = {
        res_model: resModel,
        res_model_id: modelId,
        res_id: resId,
        summary: activitySummary,
        note: activityNote,
        date_deadline: input.startAt.toISOString().slice(0, 10),
      };
      if (activityTypeId) activityVals.activity_type_id = activityTypeId;
      const activityId = await this.callModel<number>(
        odooCreds,
        "mail.activity",
        "create",
        [activityVals],
      );
      // Mark as done so it shows up in the past-activities timeline.
      await this.callModel(
        odooCreds,
        "mail.activity",
        "action_feedback",
        [[activityId]],
        { feedback: activitySummary },
      ).catch(() => {
        // Not all versions expose action_feedback; the activity still exists.
      });
    } catch (err) {
      this.logger.warn(
        `mail.activity creation skipped for meeting ${input.idempotencyKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      ref: { externalId: String(resId), externalType: target.externalType },
      syncMode: "crm_activity_with_note",
    };
  }

  // ── Recording file upload ───────────────────────────────────────────────
  async uploadRecording(creds: CrmCredentials, input: CrmRecordingUploadInput): Promise<CrmRecordingUploadResult> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);

    const target = input.linkedRecords[0];
    if (!target) {
      throw new CrmError("VALIDATION", false, "recording upload requires at least one linked record");
    }

    const resModel = "res.partner";
    const resId = Number(target.externalId);

    // Idempotency: check if attachment with same name already exists
    try {
      const existing = await this.callModel<number[]>(
        odooCreds,
        "ir.attachment",
        "search",
        [[
          ["name", "=", input.fileName],
          ["res_model", "=", resModel],
          ["res_id", "=", resId],
        ]],
        { limit: 1 },
      );
      if (existing && existing.length > 0) {
        return {
          ref: { externalId: String(resId), externalType: target.externalType },
          externalFileId: String(existing[0]),
          syncMode: "odoo_ir_attachment",
        };
      }
    } catch {
      // Non-fatal: if search fails, proceed to create
    }

    // Create the ir.attachment
    const attachmentId = await this.callModel<number>(
      odooCreds,
      "ir.attachment",
      "create",
      [{
        name: input.fileName,
        datas: input.fileBuffer.toString("base64"),
        res_model: resModel,
        res_id: resId,
        mimetype: input.fileMimeType,
        type: "binary",
      }],
    );

    return {
      ref: { externalId: String(resId), externalType: target.externalType },
      externalFileId: String(attachmentId),
      syncMode: "odoo_ir_attachment",
    };
  }

  // ── Fetch & bulk ─────────────────────────────────────────────────────
  async fetchPerson(creds: CrmCredentials, externalId: string): Promise<CrmContactSyncResult> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);
    const fields = await this.resolvePartnerFields(odooCreds);
    const records = await this.callModel<OdooPartnerRecord[]>(
      odooCreds,
      "res.partner",
      "read",
      [[Number(externalId)]],
      { fields },
    );
    if (!records?.[0]) {
      throw new CrmError("NOT_FOUND", false, `odoo partner ${externalId} not found`);
    }
    return mapOdooPartnerToSyncResult(records[0]);
  }

  async fetchCompany(creds: CrmCredentials, externalId: string): Promise<CrmCompanySyncResult> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);
    const fields = await this.resolvePartnerFields(odooCreds);
    const records = await this.callModel<OdooPartnerRecord[]>(
      odooCreds,
      "res.partner",
      "read",
      [[Number(externalId)]],
      { fields },
    );
    if (!records?.[0]) {
      throw new CrmError("NOT_FOUND", false, `odoo partner ${externalId} not found`);
    }
    return mapOdooCompanyToSyncResult(records[0]);
  }

  async listPersons(
    creds: CrmCredentials,
    pageToken?: string | null,
    limit = 50,
  ): Promise<CrmPagedResult<CrmContactSyncResult>> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);
    const offset = pageToken ? Number(pageToken) : 0;
    const fields = await this.resolvePartnerFields(odooCreds);
    const records = await this.callModel<OdooPartnerRecord[]>(
      odooCreds,
      "res.partner",
      "search_read",
      [[["is_company", "=", false]]],
      { fields, limit, offset },
    );
    const data = (records ?? []).map(mapOdooPartnerToSyncResult);
    const hasMore = data.length >= limit;
    return {
      data,
      nextPageToken: hasMore ? String(offset + data.length) : null,
    };
  }

  async listCompanies(
    creds: CrmCredentials,
    pageToken?: string | null,
    limit = 50,
  ): Promise<CrmPagedResult<CrmCompanySyncResult>> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);
    const offset = pageToken ? Number(pageToken) : 0;
    const fields = await this.resolvePartnerFields(odooCreds);
    const records = await this.callModel<OdooPartnerRecord[]>(
      odooCreds,
      "res.partner",
      "search_read",
      [[["is_company", "=", true]]],
      { fields, limit, offset },
    );
    const data = (records ?? []).map(mapOdooCompanyToSyncResult);
    const hasMore = data.length >= limit;
    return {
      data,
      nextPageToken: hasMore ? String(offset + data.length) : null,
    };
  }

  // ── Members (Owners) ─────────────────────────────────────────────────
  async listMembers(creds: CrmCredentials): Promise<CrmOwnerRef[]> {
    const odooCreds = parseOdooCredentials(creds);
    await this.authenticate(odooCreds);
    const users = await this.callModel<OdooUserRecord[]>(
      odooCreds,
      "res.users",
      "search_read",
      [[["share", "=", false]]],
      { fields: ["id", "name", "login", "email"], limit: 200 },
    );
    return (users ?? []).map(mapOdooUserToOwnerRef);
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  protected async resolveCallActivityTypeId(
    creds: OdooCredentialPayload,
  ): Promise<number | null> {
    try {
      const found = await this.callModel<number[]>(
        creds,
        "mail.activity.type",
        "search",
        [[["category", "=", "phonecall"]]],
        { limit: 1 },
      );
      if (found?.[0]) return found[0];
      const fallback = await this.callModel<number[]>(
        creds,
        "mail.activity.type",
        "search",
        [[["name", "ilike", "call"]]],
        { limit: 1 },
      );
      return fallback?.[0] ?? null;
    } catch {
      return null;
    }
  }

  protected async resolveMeetingActivityTypeId(
    creds: OdooCredentialPayload,
  ): Promise<number | null> {
    try {
      const found = await this.callModel<number[]>(
        creds,
        "mail.activity.type",
        "search",
        [[["category", "=", "meeting"]]],
        { limit: 1 },
      );
      if (found?.[0]) return found[0];
      const fallback = await this.callModel<number[]>(
        creds,
        "mail.activity.type",
        "search",
        [[["name", "ilike", "meeting"]]],
        { limit: 1 },
      );
      return fallback?.[0] ?? null;
    } catch {
      return null;
    }
  }

  protected async resolveIrModelId(
    creds: OdooCredentialPayload,
    model: string,
  ): Promise<number | null> {
    try {
      const ids = await this.callModel<number[]>(
        creds,
        "ir.model",
        "search",
        [[["model", "=", model]]],
        { limit: 1 },
      );
      return ids?.[0] ?? null;
    } catch {
      return null;
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/**
 * If the body is plain text (no HTML tags) and contains bare URLs,
 * wrap each URL in an anchor so Odoo's chatter renders them clickable.
 * Already-HTML bodies are left untouched.
 */
function linkifyBareUrls(input: string): string {
  if (/<\s*\w+[^>]*>/.test(input)) return input;
  const urlRe = /\bhttps?:\/\/[^\s<>"']+/gi;
  return input.replace(urlRe, (url) => {
    return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`;
  });
}
