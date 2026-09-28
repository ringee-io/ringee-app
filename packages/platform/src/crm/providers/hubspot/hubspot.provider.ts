import { Injectable } from "@nestjs/common";
import { CrmProviderType } from "@ringee/database";
import { AbstractCrmProvider } from "../../abstract-provider";
import { CrmError } from "../../errors";
import { phoneNationalNumber } from "../../phone";
import type {
  CrmAuthorizeParams,
  CrmCallLogInput,
  CrmCallLogResult,
  CrmCapabilities,
  CrmCompanyInput,
  CrmCompanyMatch,
  CrmCompanySyncResult,
  CrmContactSyncResult,
  CrmCredentials,
  CrmExchangeParams,
  CrmListRef,
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
import {
  HUBSPOT_ACTIVITY_ASSOCIATION_TYPE,
  HUBSPOT_API_VERSION,
  HUBSPOT_CONTACT_OBJECT_TYPE_ID,
  HUBSPOT_FILES_WRITE_SCOPES,
  HUBSPOT_LISTS_SCOPE,
  HUBSPOT_RECORDINGS_FOLDER,
  type HubSpotActivityObject,
} from "./hubspot.api";
import { HUBSPOT_CAPABILITIES } from "./hubspot.capabilities";
import {
  classifyHubSpotHttpError,
  hubspotConflictExistingId,
  isHubSpotPropertyRejection,
} from "./hubspot.errors";
import { escapeHtml } from "./hubspot.html";
import {
  HUBSPOT_COMPANY_PROPERTIES,
  HUBSPOT_CONTACT_PROPERTIES,
  buildHubSpotCallProperties,
  buildHubSpotCompanyProperties,
  buildHubSpotContactProperties,
  buildHubSpotMeetingProperties,
  buildHubSpotNoteBody,
  buildHubSpotRichText,
  hubspotCallDirection,
  hubspotContactGaps,
  hubspotEmailFilterGroups,
  hubspotPhoneFilterGroups,
  hubspotPhonesMatch,
  hubspotPropertyGaps,
  mapHubSpotCompanyToMatch,
  mapHubSpotCompanyToSyncResult,
  mapHubSpotContactToMatch,
  mapHubSpotContactToSyncResult,
  mapHubSpotOwnerToOwnerRef,
  normalizeHubSpotDomain,
} from "./hubspot.mapper";
import type {
  HubSpotAssociationInput,
  HubSpotCreateInput,
  HubSpotFile,
  HubSpotFilter,
  HubSpotListSearchResponse,
  HubSpotObject,
  HubSpotOwner,
  HubSpotPage,
  HubSpotSearchRequest,
  HubSpotTokenIntrospection,
  HubSpotTokenResponse,
} from "./hubspot.types";

export type HubSpotProviderConfig = {
  clientId: string;
  clientSecret: string;
  /** `https://api.hubapi.com` — CRM, Files and the OAuth token endpoints. */
  apiBaseUrl: string;
  /** `https://app.hubspot.com/oauth/authorize` — where the app is installed. */
  authorizeUrl: string;
  /**
   * Required scopes. HubSpot rejects an install URL whose required scopes
   * differ from those configured on the app, so these must match it exactly.
   */
  scopes: string[];
  /** Scopes the app marks optional; a portal may install without them. */
  optionalScopes: string[];
};

type HubSpotCrmObject = "contacts" | "companies" | HubSpotActivityObject;

const OAUTH_TIMEOUT_MS = 15_000;
/** Largest page HubSpot's CRM list endpoint returns. */
const MAX_PAGE_SIZE = 100;
const OWNER_PAGE_SIZE = 100;
const MAX_OWNER_PAGES = 10;
const LIST_PAGE_SIZE = 100;
const MAX_LIST_PAGES = 20;
/** A task without a due date is due tomorrow, as in the Odoo adapter. */
const DEFAULT_TASK_DUE_MS = 24 * 60 * 60 * 1000;
/** Rejections of a gap's value — not of the connection or the request. */
const GAP_REJECTIONS = new Set<CrmError["code"]>([
  "VALIDATION",
  "CONFLICT",
  "NOT_FOUND",
]);

/**
 * HubSpot CRM adapter.
 *
 * Calls are logged as native call activities (with direction, duration,
 * status, outcome and an inline recording), notes, tasks and meetings as
 * their native activity objects, and recordings as private File Manager
 * uploads attached to a note. Contacts and companies sync both ways.
 */
@Injectable()
export class HubSpotProvider extends AbstractCrmProvider {
  readonly type: CrmProviderType = "hubspot";
  readonly capabilities: CrmCapabilities = HUBSPOT_CAPABILITIES;

  constructor(private readonly config: HubSpotProviderConfig) {
    super();
  }

  protected classifyHttpError(
    status: number,
    body?: unknown,
    retryAfter?: string | null,
  ): CrmError {
    return classifyHubSpotHttpError(status, body, retryAfter);
  }

  // ── OAuth ─────────────────────────────────────────────────────────────

  getAuthorizationUrl(params: CrmAuthorizeParams): string {
    this.assertConfigured();
    const scopes =
      params.scope && params.scope.length > 0
        ? params.scope
        : this.config.scopes;
    const query: Array<[string, string]> = [
      ["client_id", this.config.clientId],
      ["redirect_uri", params.redirectUri],
      ["scope", scopes.join(" ")],
      ["state", params.state],
    ];
    if (this.config.optionalScopes.length > 0) {
      query.push(["optional_scope", this.config.optionalScopes.join(" ")]);
    }
    // encodeURIComponent rather than URLSearchParams: HubSpot documents scope
    // lists separated by `%20`, and URLSearchParams would send `+`.
    const qs = query
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join("&");
    return `${this.config.authorizeUrl}?${qs}`;
  }

  exchangeCode(params: CrmExchangeParams): Promise<CrmTokenSet> {
    return this.tokenRequest({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
    });
  }

  refreshToken(refreshToken: string): Promise<CrmTokenSet> {
    return this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  private async tokenRequest(
    grant: Record<string, string>,
  ): Promise<CrmTokenSet> {
    const data = await this.oauthRequest<HubSpotTokenResponse>("token", grant);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      scopes: data.scopes,
    };
  }

  /**
   * POSTs a form to one of the OAuth endpoints. The client secret and the
   * tokens travel in the body, never in the URL, so they stay out of logs.
   */
  private async oauthRequest<T>(
    path: string,
    fields: Record<string, string>,
  ): Promise<T> {
    this.assertConfigured();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OAUTH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(
        `${this.config.apiBaseUrl}/oauth/${HUBSPOT_API_VERSION}/${path}`,
        {
          method: "POST",
          headers: {
            "User-Agent": "ringee/1.0",
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            ...fields,
          }).toString(),
          signal: controller.signal,
        },
      );
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new CrmError(
          "TRANSIENT",
          true,
          `timeout after ${OAUTH_TIMEOUT_MS}ms`,
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new CrmError("TRANSIENT", true, `network error: ${message}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw this.classifyHttpError(
        res.status,
        parseJson(text) ?? text,
        res.headers.get("retry-after"),
      );
    }
    return (await res.json()) as T;
  }

  /** Fails before sending anyone to HubSpot with an empty client id. */
  private assertConfigured(): void {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new CrmError(
        "PROVIDER_UNAVAILABLE",
        false,
        "HubSpot OAuth is not configured: set HUBSPOT_OAUTH_CLIENT_ID and HUBSPOT_OAUTH_CLIENT_SECRET",
      );
    }
  }

  // ── Identity ──────────────────────────────────────────────────────────

  async getWorkspaceInfo(creds: CrmCredentials): Promise<CrmWorkspaceInfo> {
    const info = await this.oauthRequest<HubSpotTokenIntrospection>(
      "token/introspect",
      { token: creds.accessToken, token_type_hint: "access_token" },
    );
    if (info.active === false || info.hub_id == null) {
      throw new CrmError(
        "AUTH_REVOKED",
        false,
        "HubSpot reports the access token as inactive",
      );
    }

    return {
      accountId: String(info.hub_id),
      accountName: info.hub_domain ?? null,
      // Only when HubSpot says which scopes it granted: assuming "not
      // granted" would switch features off for a portal that allowed them.
      capabilities: Array.isArray(info.scopes)
        ? scopeCapabilities(info.scopes)
        : undefined,
      metadata: {
        hubId: info.hub_id,
        hubDomain: info.hub_domain ?? null,
        appId: info.app_id ?? null,
      },
    };
  }

  // ── Matching ──────────────────────────────────────────────────────────

  async searchByPhone(
    creds: CrmCredentials,
    phoneE164: string,
    opts: { limit?: number } = {},
  ): Promise<CrmRecordMatch[]> {
    const search = (filterGroups: HubSpotSearchRequest["filterGroups"]) =>
      this.searchObjects(creds, "contacts", {
        filterGroups,
        properties: HUBSPOT_CONTACT_PROPERTIES,
        limit: clampLimit(opts.limit ?? 10),
      });

    let page: HubSpotPage<HubSpotObject>;
    try {
      page = await search(
        hubspotPhoneFilterGroups(phoneE164, phoneNationalNumber(phoneE164)),
      );
    } catch (err) {
      // A 400 means a filter named a property this portal rejects; the typed
      // phone properties exist on every portal.
      if (!(err instanceof CrmError) || err.code !== "VALIDATION") throw err;
      page = await search(hubspotPhoneFilterGroups(phoneE164, null));
    }

    // The search is over-inclusive by design (tokens, wildcards). Only records
    // whose numbers really match are candidates: more than one sends the call
    // to manual resolution, so a stray hit would cost the user a click.
    return page.results
      .map((record) => mapHubSpotContactToMatch(record, phoneE164))
      .filter((match) => hubspotPhonesMatch(match.phoneNumbers, phoneE164));
  }

  async searchByEmail(
    creds: CrmCredentials,
    email: string,
    opts: { limit?: number } = {},
  ): Promise<CrmRecordMatch[]> {
    const page = await this.searchObjects(creds, "contacts", {
      filterGroups: hubspotEmailFilterGroups(email.trim()),
      properties: HUBSPOT_CONTACT_PROPERTIES,
      limit: clampLimit(opts.limit ?? 10),
    });
    return page.results.map((record) => mapHubSpotContactToMatch(record, ""));
  }

  async searchCompanyByDomain(
    creds: CrmCredentials,
    domain: string,
  ): Promise<CrmCompanyMatch[]> {
    const normalized = normalizeHubSpotDomain(domain);
    if (!normalized) return [];
    const page = await this.searchObjects(creds, "companies", {
      filterGroups: [
        {
          filters: [
            { propertyName: "domain", operator: "EQ", value: normalized },
          ],
        },
      ],
      properties: HUBSPOT_COMPANY_PROPERTIES,
      limit: 10,
    });
    return page.results.map((record) =>
      mapHubSpotCompanyToMatch(record, normalized),
    );
  }

  // ── Upsert ────────────────────────────────────────────────────────────

  async upsertPerson(
    creds: CrmCredentials,
    input: CrmPersonInput,
  ): Promise<CrmRecordRef> {
    const desired = buildHubSpotContactProperties(input);
    const existing = await this.findContactForUpsert(creds, input);
    if (existing) {
      await this.fillGaps(
        creds,
        "contacts",
        existing.id,
        hubspotContactGaps(existing.properties, desired),
      );
      return { externalId: existing.id, externalType: "person" };
    }

    try {
      const created = await this.createContact(creds, desired);
      return { externalId: created.id, externalType: "person" };
    } catch (err) {
      // Two syncs creating the same e-mail at once: HubSpot tells the loser
      // which contact won. That is the one to log against, and it gets this
      // sync's data the same way a contact found by search does — gaps only.
      const existingId = hubspotConflictExistingId(err);
      if (!existingId) throw err;
      const winner = await this.getObjectOrNull(
        creds,
        "contacts",
        existingId,
        HUBSPOT_CONTACT_PROPERTIES,
      );
      if (winner) {
        await this.fillGaps(
          creds,
          "contacts",
          winner.id,
          hubspotContactGaps(winner.properties, desired),
        );
      }
      return { externalId: existingId, externalType: "person" };
    }
  }

  /**
   * The contact an upsert writes into: the owner of the e-mail — HubSpot's
   * own unique key for contacts — else the best phone match, exact before
   * suffix (the Attio and Odoo adapters also adopt a phone match).
   */
  private async findContactForUpsert(
    creds: CrmCredentials,
    input: CrmPersonInput,
  ): Promise<HubSpotObject | null> {
    const email = input.email?.trim();
    if (email) {
      const byEmail = await this.getObjectOrNull(
        creds,
        "contacts",
        email,
        HUBSPOT_CONTACT_PROPERTIES,
        "email",
      );
      if (byEmail) return byEmail;
    }

    const matches = await this.searchByPhone(creds, input.phoneE164);
    const best =
      matches.find((match) => match.phoneNumbers.includes(input.phoneE164)) ??
      matches[0];
    return best ? (best.raw as HubSpotObject) : null;
  }

  /**
   * Creates a contact. An address HubSpot refuses as malformed must not cost
   * the call its log, so the contact is created again without it.
   */
  private async createContact(
    creds: CrmCredentials,
    properties: Record<string, string>,
  ): Promise<HubSpotObject> {
    try {
      return await this.createObject(creds, "contacts", { properties });
    } catch (err) {
      if (!properties.email || !isHubSpotPropertyRejection(err, "email")) {
        throw err;
      }
      const withoutEmail = { ...properties };
      delete withoutEmail.email;
      return this.createObject(creds, "contacts", {
        properties: withoutEmail,
      });
    }
  }

  async upsertCompany(
    creds: CrmCredentials,
    input: CrmCompanyInput,
  ): Promise<CrmRecordRef> {
    const desired = buildHubSpotCompanyProperties(input);
    if (!desired.name && !desired.domain) {
      throw new CrmError(
        "VALIDATION",
        false,
        "hubspot company requires a name or domain",
      );
    }

    const existing = await this.findCompanyForUpsert(creds, desired);
    if (existing) {
      await this.fillGaps(
        creds,
        "companies",
        existing.id,
        hubspotPropertyGaps(existing.properties, desired),
      );
      return { externalId: existing.id, externalType: "company" };
    }

    const created = await this.createObject(creds, "companies", {
      properties: desired,
    });
    return { externalId: created.id, externalType: "company" };
  }

  private async findCompanyForUpsert(
    creds: CrmCredentials,
    desired: Record<string, string>,
  ): Promise<HubSpotObject | null> {
    const lookups: HubSpotFilter[] = [];
    if (desired.domain) {
      lookups.push({
        propertyName: "domain",
        operator: "EQ",
        value: desired.domain,
      });
    }
    if (desired.name) {
      lookups.push({
        propertyName: "name",
        operator: "EQ",
        value: desired.name,
      });
    }

    for (const filter of lookups) {
      const page = await this.searchObjects(creds, "companies", {
        filterGroups: [{ filters: [filter] }],
        properties: HUBSPOT_COMPANY_PROPERTIES,
        limit: 1,
      });
      if (page.results[0]) return page.results[0];
    }
    return null;
  }

  /**
   * Writes the gaps of an existing record. The record is already the right
   * one, so a rejected gap (an e-mail another contact owns, a value the
   * portal's validation rules refuse) is logged and skipped rather than
   * failing the call log it was part of.
   */
  private async fillGaps(
    creds: CrmCredentials,
    objectType: "contacts" | "companies",
    id: string,
    gaps: Record<string, string>,
  ): Promise<void> {
    if (Object.keys(gaps).length === 0) return;
    try {
      await this.updateObject(creds, objectType, id, gaps);
    } catch (err) {
      if (!(err instanceof CrmError) || !GAP_REJECTIONS.has(err.code)) {
        throw err;
      }
      this.logger.warn(
        `hubspot ${objectType} ${id} gap fill skipped on connection ${creds.connectionId}: ${err.code}`,
      );
    }
  }

  // ── Call log ──────────────────────────────────────────────────────────

  async logCall(
    creds: CrmCredentials,
    input: CrmCallLogInput,
  ): Promise<CrmCallLogResult> {
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
      throw new CrmError(
        "NOT_FOUND",
        false,
        "no linked record and no creation data",
      );
    }

    // A retry after a lost response must not log the call twice. The start
    // time (to the millisecond), direction and record identify it.
    const existingId = await this.findLoggedActivity(creds, "calls", target, [
      {
        propertyName: "hs_timestamp",
        operator: "EQ",
        value: String(input.startedAt.getTime()),
      },
      {
        propertyName: "hs_call_direction",
        operator: "EQ",
        value: hubspotCallDirection(input),
      },
    ]);
    if (existingId) return { record: target, activityId: existingId };

    const properties = buildHubSpotCallProperties(input);
    const associations = [this.associate(target, "calls")];
    let call: HubSpotObject;
    try {
      call = await this.createObject(creds, "calls", {
        properties,
        associations,
      });
    } catch (err) {
      // An admin can delete HubSpot's built-in call outcomes, and the portal
      // then rejects that outcome's id. The call still belongs on the
      // timeline, so it is logged again without one.
      if (
        !properties.hs_call_disposition ||
        !isHubSpotPropertyRejection(err, "hs_call_disposition")
      ) {
        throw err;
      }
      const withoutDisposition = { ...properties };
      delete withoutDisposition.hs_call_disposition;
      call = await this.createObject(creds, "calls", {
        properties: withoutDisposition,
        associations,
      });
    }

    // `record` is the contact/company the call sits on — what recording and
    // transcript follow-ups target. `activityId` is the call itself.
    return { record: target, activityId: call.id };
  }

  // ── Note ──────────────────────────────────────────────────────────────

  async addNote(
    creds: CrmCredentials,
    input: CrmNoteInput,
  ): Promise<CrmRecordRef> {
    const target: CrmRecordRef = {
      externalId: input.recordId,
      externalType: input.recordType,
    };
    const note = await this.createObject(creds, "notes", {
      properties: {
        hs_timestamp: new Date().toISOString(),
        hs_note_body: buildHubSpotNoteBody(input.title, input.body),
      },
      associations: [this.associate(target, "notes")],
    });
    return { externalId: note.id, externalType: input.recordType };
  }

  // ── Task ──────────────────────────────────────────────────────────────

  async createTask(
    creds: CrmCredentials,
    input: CrmTaskInput,
  ): Promise<CrmRecordRef> {
    const target = input.linkedRecords[0];
    if (!target) {
      throw new CrmError(
        "VALIDATION",
        false,
        "hubspot task requires at least one linked record",
      );
    }

    const properties: Record<string, string> = {
      // For a task, `hs_timestamp` is the due date.
      hs_timestamp: (
        input.dueAt ?? new Date(Date.now() + DEFAULT_TASK_DUE_MS)
      ).toISOString(),
      hs_task_subject: input.title,
      hs_task_status: "NOT_STARTED",
      hs_task_type: "TODO",
    };
    const body = input.body?.trim();
    if (body) properties.hs_task_body = buildHubSpotRichText(body);
    const ownerId = input.assigneeEmail
      ? await this.resolveOwnerId(creds, input.assigneeEmail)
      : null;
    if (ownerId) properties.hubspot_owner_id = ownerId;

    const task = await this.createObject(creds, "tasks", {
      properties,
      associations: input.linkedRecords.map((record) =>
        this.associate(record, "tasks"),
      ),
    });
    return { externalId: task.id, externalType: target.externalType };
  }

  // ── Meeting ───────────────────────────────────────────────────────────

  async upsertMeeting(
    creds: CrmCredentials,
    input: CrmMeetingInput,
  ): Promise<CrmMeetingSyncResult> {
    const target = input.linkedRecords[0];
    if (!target) {
      throw new CrmError(
        "VALIDATION",
        false,
        "meeting sync requires at least one linked record",
      );
    }

    const existingId = await this.findLoggedActivity(
      creds,
      "meetings",
      target,
      [
        {
          propertyName: "hs_timestamp",
          operator: "EQ",
          value: String(input.startAt.getTime()),
        },
        {
          propertyName: "hs_meeting_title",
          operator: "EQ",
          value: input.title,
        },
      ],
    );
    if (existingId) {
      return {
        ref: { externalId: existingId, externalType: target.externalType },
        syncMode: "hubspot_meeting",
      };
    }

    const properties = buildHubSpotMeetingProperties(input);
    const ownerId = input.ownerEmail
      ? await this.resolveOwnerId(creds, input.ownerEmail)
      : null;
    if (ownerId) properties.hubspot_owner_id = ownerId;

    const meeting = await this.createObject(creds, "meetings", {
      properties,
      associations: input.linkedRecords.map((record) =>
        this.associate(record, "meetings"),
      ),
    });
    return {
      ref: { externalId: meeting.id, externalType: target.externalType },
      syncMode: "hubspot_meeting",
    };
  }

  // ── Recording file upload ─────────────────────────────────────────────

  async uploadRecording(
    creds: CrmCredentials,
    input: CrmRecordingUploadInput,
  ): Promise<CrmRecordingUploadResult> {
    const target = input.linkedRecords[0];
    if (!target) {
      throw new CrmError(
        "VALIDATION",
        false,
        "recording upload requires at least one linked record",
      );
    }

    const file = await this.uploadFile(creds, input);

    // The note carrying the file is what shows the recording on the record.
    // A retry finds the file (RETURN_EXISTING) and then the note.
    const existingNoteId = await this.findLoggedActivity(
      creds,
      "notes",
      target,
      [{ propertyName: "hs_attachment_ids", operator: "EQ", value: file.id }],
    );
    const noteId =
      existingNoteId ??
      (
        await this.createObject(creds, "notes", {
          properties: {
            hs_timestamp: new Date().toISOString(),
            hs_note_body: `<p><strong>Call recording</strong></p><p>${escapeHtml(input.fileName)}</p>`,
            hs_attachment_ids: file.id,
          },
          associations: [this.associate(target, "notes")],
        })
      ).id;

    return {
      ref: { externalId: noteId, externalType: target.externalType },
      externalFileId: file.id,
      syncMode: "hubspot_note_attachment",
    };
  }

  /**
   * Uploads a recording as a private File Manager file — call audio is
   * personal data and must not get a public URL. `RETURN_EXISTING` makes a
   * retried upload of the same recording return the file already there.
   */
  private uploadFile(
    creds: CrmCredentials,
    input: CrmRecordingUploadInput,
  ): Promise<HubSpotFile> {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(input.fileBuffer)], {
        type: input.fileMimeType,
      }),
      input.fileName,
    );
    form.append("fileName", input.fileName);
    form.append("folderPath", HUBSPOT_RECORDINGS_FOLDER);
    form.append(
      "options",
      JSON.stringify({
        access: "PRIVATE",
        overwrite: false,
        duplicateValidationStrategy: "RETURN_EXISTING",
        duplicateValidationScope: "EXACT_FOLDER",
      }),
    );
    return this.requestMultipart<HubSpotFile>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/files/${HUBSPOT_API_VERSION}/files`,
      headers: this.authHeaders(creds.accessToken),
      formData: form,
    });
  }

  // ── Fetch & bulk listing ──────────────────────────────────────────────

  async fetchPerson(
    creds: CrmCredentials,
    externalId: string,
  ): Promise<CrmContactSyncResult> {
    const record = await this.getObject(
      creds,
      "contacts",
      externalId,
      HUBSPOT_CONTACT_PROPERTIES,
    );
    return mapHubSpotContactToSyncResult(record);
  }

  async fetchCompany(
    creds: CrmCredentials,
    externalId: string,
  ): Promise<CrmCompanySyncResult> {
    const record = await this.getObject(
      creds,
      "companies",
      externalId,
      HUBSPOT_COMPANY_PROPERTIES,
    );
    return mapHubSpotCompanyToSyncResult(record);
  }

  async listPersons(
    creds: CrmCredentials,
    pageToken?: string | null,
    limit = 50,
  ): Promise<CrmPagedResult<CrmContactSyncResult>> {
    const page = await this.listObjects(
      creds,
      "contacts",
      HUBSPOT_CONTACT_PROPERTIES,
      pageToken,
      limit,
    );
    return {
      data: page.results.map(mapHubSpotContactToSyncResult),
      nextPageToken: page.paging?.next?.after ?? null,
    };
  }

  async listCompanies(
    creds: CrmCredentials,
    pageToken?: string | null,
    limit = 50,
  ): Promise<CrmPagedResult<CrmCompanySyncResult>> {
    const page = await this.listObjects(
      creds,
      "companies",
      HUBSPOT_COMPANY_PROPERTIES,
      pageToken,
      limit,
    );
    return {
      data: page.results.map(mapHubSpotCompanyToSyncResult),
      nextPageToken: page.paging?.next?.after ?? null,
    };
  }

  // ── Lists ─────────────────────────────────────────────────────────────

  /** Contact lists (HubSpot "segments"); company and deal lists are skipped. */
  async listLists(creds: CrmCredentials): Promise<CrmListRef[]> {
    const lists: CrmListRef[] = [];
    let offset = 0;

    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const res = await this.request<HubSpotListSearchResponse>({
        method: "POST",
        url: `${this.config.apiBaseUrl}/crm/lists/${HUBSPOT_API_VERSION}/search`,
        headers: this.authHeaders(creds.accessToken),
        body: {
          count: LIST_PAGE_SIZE,
          offset,
          additionalProperties: ["hs_list_size"],
        },
      });
      const batch = res.lists ?? [];
      for (const list of batch) {
        if (
          list.objectTypeId &&
          list.objectTypeId !== HUBSPOT_CONTACT_OBJECT_TYPE_ID
        ) {
          continue;
        }
        const size = list.additionalProperties?.hs_list_size;
        lists.push({
          externalId: String(list.listId),
          name: list.name,
          ...(size && Number.isFinite(Number(size))
            ? { memberCount: Number(size) }
            : {}),
        });
      }
      if (!res.hasMore || batch.length === 0) break;
      offset += batch.length;
    }

    return lists;
  }

  // ── Owners ────────────────────────────────────────────────────────────

  async listMembers(creds: CrmCredentials): Promise<CrmOwnerRef[]> {
    const owners: CrmOwnerRef[] = [];
    let after: string | undefined;

    for (let page = 0; page < MAX_OWNER_PAGES; page++) {
      const res = await this.request<HubSpotPage<HubSpotOwner>>({
        method: "GET",
        url: this.ownersUrl(),
        headers: this.authHeaders(creds.accessToken),
        query: { limit: OWNER_PAGE_SIZE, after, archived: false },
      });
      owners.push(...(res.results ?? []).map(mapHubSpotOwnerToOwnerRef));
      after = res.paging?.next?.after;
      if (!after) break;
    }

    return owners;
  }

  /**
   * The HubSpot owner for a Ringee user's e-mail. An activity without an
   * owner is still worth logging, so a failed lookup is not fatal — except
   * a token that needs refreshing, which the caller must see to refresh it.
   */
  private async resolveOwnerId(
    creds: CrmCredentials,
    email: string,
  ): Promise<string | null> {
    try {
      const res = await this.request<HubSpotPage<HubSpotOwner>>({
        method: "GET",
        url: this.ownersUrl(),
        headers: this.authHeaders(creds.accessToken),
        query: { email: email.trim(), limit: 1, archived: false },
      });
      return res.results?.[0]?.id ?? null;
    } catch (err) {
      if (err instanceof CrmError && err.code === "AUTH_EXPIRED") throw err;
      this.logger.warn(
        `hubspot owner lookup failed on connection ${creds.connectionId}: ${describeFailure(err)}`,
      );
      return null;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /**
   * The activity a previous attempt already logged on this record, if any.
   * Only a guard against duplicates on retry: HubSpot's search index trails
   * writes by a few seconds, so an immediate retry can still miss it, and a
   * failed lookup falls through to the create. A token that needs refreshing
   * still surfaces so the caller can refresh it.
   */
  private async findLoggedActivity(
    creds: CrmCredentials,
    objectType: HubSpotActivityObject,
    target: CrmRecordRef,
    filters: HubSpotFilter[],
  ): Promise<string | null> {
    if (target.externalType === "list") return null;
    try {
      const page = await this.searchObjects(creds, objectType, {
        filterGroups: [
          {
            filters: [
              {
                propertyName:
                  target.externalType === "company"
                    ? "associations.company"
                    : "associations.contact",
                operator: "EQ",
                value: target.externalId,
              },
              ...filters,
            ],
          },
        ],
        properties: ["hs_timestamp"],
        limit: 1,
      });
      return page.results[0]?.id ?? null;
    } catch (err) {
      if (err instanceof CrmError && err.code === "AUTH_EXPIRED") throw err;
      this.logger.debug(
        `hubspot ${objectType} duplicate check skipped on connection ${creds.connectionId}: ${describeFailure(err)}`,
      );
      return null;
    }
  }

  private associate(
    target: CrmRecordRef,
    objectType: HubSpotActivityObject,
  ): HubSpotAssociationInput {
    if (target.externalType === "list") {
      throw new CrmError(
        "VALIDATION",
        false,
        `a HubSpot ${objectType} activity cannot be logged on a list`,
      );
    }
    const types = HUBSPOT_ACTIVITY_ASSOCIATION_TYPE[objectType];
    return {
      to: { id: target.externalId },
      types: [
        {
          associationCategory: "HUBSPOT_DEFINED",
          associationTypeId:
            target.externalType === "company" ? types.company : types.person,
        },
      ],
    };
  }

  private objectsUrl(objectType: HubSpotCrmObject, suffix = ""): string {
    return `${this.config.apiBaseUrl}/crm/objects/${HUBSPOT_API_VERSION}/${objectType}${suffix}`;
  }

  private ownersUrl(): string {
    return `${this.config.apiBaseUrl}/crm/owners/${HUBSPOT_API_VERSION}`;
  }

  private createObject(
    creds: CrmCredentials,
    objectType: HubSpotCrmObject,
    input: HubSpotCreateInput,
  ): Promise<HubSpotObject> {
    return this.request<HubSpotObject>({
      method: "POST",
      url: this.objectsUrl(objectType),
      headers: this.authHeaders(creds.accessToken),
      body: input,
    });
  }

  private updateObject(
    creds: CrmCredentials,
    objectType: HubSpotCrmObject,
    id: string,
    properties: Record<string, string>,
  ): Promise<HubSpotObject> {
    return this.request<HubSpotObject>({
      method: "PATCH",
      url: this.objectsUrl(objectType, `/${encodeURIComponent(id)}`),
      headers: this.authHeaders(creds.accessToken),
      body: { properties },
    });
  }

  private getObject(
    creds: CrmCredentials,
    objectType: HubSpotCrmObject,
    id: string,
    properties: string[],
    idProperty?: string,
  ): Promise<HubSpotObject> {
    return this.request<HubSpotObject>({
      method: "GET",
      url: this.objectsUrl(objectType, `/${encodeURIComponent(id)}`),
      headers: this.authHeaders(creds.accessToken),
      query: { properties: properties.join(","), idProperty },
    });
  }

  private async getObjectOrNull(
    creds: CrmCredentials,
    objectType: HubSpotCrmObject,
    id: string,
    properties: string[],
    idProperty?: string,
  ): Promise<HubSpotObject | null> {
    try {
      return await this.getObject(
        creds,
        objectType,
        id,
        properties,
        idProperty,
      );
    } catch (err) {
      if (err instanceof CrmError && err.code === "NOT_FOUND") return null;
      throw err;
    }
  }

  private searchObjects(
    creds: CrmCredentials,
    objectType: HubSpotCrmObject,
    body: HubSpotSearchRequest,
  ): Promise<HubSpotPage<HubSpotObject>> {
    return this.request<HubSpotPage<HubSpotObject>>({
      method: "POST",
      url: this.objectsUrl(objectType, "/search"),
      headers: this.authHeaders(creds.accessToken),
      body,
    });
  }

  private listObjects(
    creds: CrmCredentials,
    objectType: HubSpotCrmObject,
    properties: string[],
    after: string | null | undefined,
    limit: number,
  ): Promise<HubSpotPage<HubSpotObject>> {
    return this.request<HubSpotPage<HubSpotObject>>({
      method: "GET",
      url: this.objectsUrl(objectType),
      headers: this.authHeaders(creds.accessToken),
      query: {
        limit: clampLimit(limit),
        after: after ?? undefined,
        properties: properties.join(","),
        archived: false,
      },
    });
  }
}

function scopeCapabilities(scopes: string[]): Partial<CrmCapabilities> {
  return {
    supportsLists: scopes.includes(HUBSPOT_LISTS_SCOPE),
    supportsRecordingUpload: HUBSPOT_FILES_WRITE_SCOPES.some((scope) =>
      scopes.includes(scope),
    ),
  };
}

function clampLimit(limit: number): number {
  return Math.min(Math.max(1, Math.floor(limit)), MAX_PAGE_SIZE);
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A failure's code, never its payload — payloads carry contact data. */
function describeFailure(err: unknown): string {
  return err instanceof CrmError ? err.code : "unexpected error";
}
