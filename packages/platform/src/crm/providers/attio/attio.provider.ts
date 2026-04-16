import { Injectable } from "@nestjs/common";
import { CrmProviderType } from "@ringee/database";
import { AbstractCrmProvider } from "../../abstract-provider";
import { CrmError } from "../../errors";
import type {
  CrmAuthorizeParams,
  CrmCallLogInput,
  CrmCapabilities,
  CrmCompanyInput,
  CrmCredentials,
  CrmExchangeParams,
  CrmNoteInput,
  CrmPersonInput,
  CrmRecordMatch,
  CrmRecordRef,
  CrmTaskInput,
  CrmTokenSet,
  CrmWorkspaceInfo,
} from "../../types";
import { ATTIO_CAPABILITIES } from "./attio.capabilities";
import { attioIdempotencyTag, buildCallLogNote, mapAttioPersonToMatch } from "./attio.mapper";
import type {
  AttioNoteRequest,
  AttioNoteResponse,
  AttioOAuthTokenResponse,
  AttioPersonRecord,
  AttioQueryResponse,
  AttioRecordResponse,
  AttioTaskRequest,
  AttioTaskResponse,
  AttioWorkspaceResponse,
} from "./attio.types";

export type AttioProviderConfig = {
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
};

@Injectable()
export class AttioProvider extends AbstractCrmProvider {
  readonly type: CrmProviderType = "attio";
  readonly capabilities: CrmCapabilities = ATTIO_CAPABILITIES;

  constructor(private readonly config: AttioProviderConfig) {
    super();
  }

  // ── OAuth ─────────────────────────────────────────────────────────────

  getAuthorizationUrl(params: CrmAuthorizeParams): string {
    const qs = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: params.redirectUri,
      response_type: "code",
      state: params.state,
    });
    if (params.scope && params.scope.length > 0) qs.set("scope", params.scope.join(" "));
    return `${this.config.authorizeUrl}?${qs.toString()}`;
  }

  async exchangeCode(params: CrmExchangeParams): Promise<CrmTokenSet> {
    return this.tokenRequest({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
    });
  }

  async refreshToken(refreshToken: string): Promise<CrmTokenSet> {
    return this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  private async tokenRequest(body: Record<string, string>): Promise<CrmTokenSet> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      ...body,
    });
    const res = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => undefined);
      throw CrmError.fromHttp(res.status, text);
    }
    const data = (await res.json()) as AttioOAuthTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
      scopes: data.scope ? data.scope.split(" ") : undefined,
    };
  }

  // ── Identity ──────────────────────────────────────────────────────────

  async getWorkspaceInfo(creds: CrmCredentials): Promise<CrmWorkspaceInfo> {
    const res = await this.request<AttioWorkspaceResponse>({
      method: "GET",
      url: `${this.config.apiBaseUrl}/v2/self`,
      headers: this.authHeaders(creds.accessToken),
    });

    return {
      accountId: res.workspace_id,
      accountName: res.workspace_name ?? null,
    };
  }

  // ── Matching ──────────────────────────────────────────────────────────

  async searchByPhone(
    creds: CrmCredentials,
    phoneE164: string,
    opts: { limit?: number } = {},
  ): Promise<CrmRecordMatch[]> {
    const res = await this.request<AttioQueryResponse<AttioPersonRecord>>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/v2/objects/people/records/query`,
      headers: this.authHeaders(creds.accessToken),
      body: {
        filter: {
          phone_numbers: { $contains: phoneE164 },
        },
        limit: opts.limit ?? 10,
      },
    });
    return (res.data ?? []).map((r) => mapAttioPersonToMatch(r, phoneE164));
  }

  // ── Upsert person ─────────────────────────────────────────────────────

  async upsertPerson(creds: CrmCredentials, input: CrmPersonInput): Promise<CrmRecordRef> {
    const values: Record<string, unknown> = {};
    if (input.email) values.email_addresses = [input.email];
    values.phone_numbers = [input.phoneE164];
    if (input.displayName || input.firstName || input.lastName) {
      values.name = [
        {
          full_name: input.displayName ?? undefined,
          first_name: input.firstName ?? undefined,
          last_name: input.lastName ?? undefined,
        },
      ];
    }

    const res = await this.request<AttioRecordResponse<AttioPersonRecord>>({
      method: "PUT",
      url: `${this.config.apiBaseUrl}/v2/objects/people/records`,
      headers: this.authHeaders(creds.accessToken),
      query: {
        matching_attribute: input.email ? "email_addresses" : "phone_numbers",
      },
      body: { data: { values } },
    });

    return {
      externalId: res.data.id.record_id,
      externalType: "person",
    };
  }

  async upsertCompany(creds: CrmCredentials, input: CrmCompanyInput): Promise<CrmRecordRef> {
    const values: Record<string, unknown> = { name: input.name };
    if (input.domain) values.domains = [input.domain];
    if (input.phoneE164) values.phone_numbers = [input.phoneE164];
    const res = await this.request<AttioRecordResponse<AttioPersonRecord>>({
      method: "PUT",
      url: `${this.config.apiBaseUrl}/v2/objects/companies/records`,
      headers: this.authHeaders(creds.accessToken),
      query: { matching_attribute: input.domain ? "domains" : "name" },
      body: { data: { values } },
    });
    return { externalId: res.data.id.record_id, externalType: "company" };
  }

  // ── Call log ─────────────────────────────────────────────────────────

  async logCall(creds: CrmCredentials, input: CrmCallLogInput): Promise<CrmRecordRef> {
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

    const { title, content } = buildCallLogNote(input);
    const body: AttioNoteRequest = {
      data: {
        format: "markdown",
        parent_object: target.externalType === "company" ? "companies" : "people",
        parent_record_id: target.externalId,
        title: `${title} ${attioIdempotencyTag(input.idempotencyKey)}`,
        content,
      },
    };

    const res = await this.request<AttioNoteResponse>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/v2/notes`,
      headers: this.authHeaders(creds.accessToken),
      body,
    });

    return {
      externalId: res.data.id.note_id,
      externalType: target.externalType,
    };
  }

  // ── Note ─────────────────────────────────────────────────────────────

  async addNote(creds: CrmCredentials, input: CrmNoteInput): Promise<CrmRecordRef> {
    const body: AttioNoteRequest = {
      data: {
        format: "markdown",
        parent_object: input.recordType === "company" ? "companies" : "people",
        parent_record_id: input.recordId,
        title: input.title ?? "Note from Ringee",
        content: input.body,
      },
    };
    const res = await this.request<AttioNoteResponse>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/v2/notes`,
      headers: this.authHeaders(creds.accessToken),
      body,
    });
    return { externalId: res.data.id.note_id, externalType: input.recordType };
  }

  // ── Task ─────────────────────────────────────────────────────────────

  async createTask(creds: CrmCredentials, input: CrmTaskInput): Promise<CrmRecordRef> {
    const body: AttioTaskRequest = {
      data: {
        content: [input.title, input.body].filter(Boolean).join("\n\n"),
        format: "plaintext",
        deadline_at: input.dueAt ? input.dueAt.toISOString() : null,
        is_completed: false,
        linked_records: input.linkedRecords.map((r) => ({
          target_object: r.externalType === "company" ? "companies" : "people",
          target_record_id: r.externalId,
        })),
      },
    };
    const res = await this.request<AttioTaskResponse>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/v2/tasks`,
      headers: this.authHeaders(creds.accessToken),
      body,
    });
    return { externalId: res.data.id.task_id, externalType: "person" };
  }
}
