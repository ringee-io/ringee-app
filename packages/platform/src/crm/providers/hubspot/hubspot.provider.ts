import { Injectable } from "@nestjs/common";
import { CrmProviderType } from "@ringee/database";
import { AbstractCrmProvider } from "../../abstract-provider";
import { CrmError } from "../../errors";
import { normalizePhoneE164 } from "../../phone";
import type {
  CrmAuthorizeParams,
  CrmCallLogInput,
  CrmCallLogResult,
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
  CrmTaskInput,
  CrmTokenSet,
  CrmWorkspaceInfo,
} from "../../types";
import { HUBSPOT_CAPABILITIES } from "./hubspot.capabilities";

export type HubSpotProviderConfig = {
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
};

type HubSpotTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type HubSpotObject = {
  id: string;
  properties: Record<string, string | null | undefined>;
  createdAt?: string;
  updatedAt?: string;
};

type HubSpotPage = {
  results: HubSpotObject[];
  paging?: { next?: { after?: string } };
};

type HubSpotSearchResponse = {
  total?: number;
  results: HubSpotObject[];
};

type HubSpotOwner = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

type HubSpotErrorBody = {
  category?: string;
  message?: string;
  status?: string;
};

const CONTACT_PROPERTIES = [
  "firstname",
  "lastname",
  "email",
  "phone",
  "mobilephone",
  "jobtitle",
  "company",
  "hubspot_owner_id",
];

const COMPANY_PROPERTIES = [
  "name",
  "domain",
  "industry",
  "numberofemployees",
  "phone",
  "website",
];

@Injectable()
export class HubSpotProvider extends AbstractCrmProvider {
  readonly type: CrmProviderType = "hubspot";
  readonly capabilities = HUBSPOT_CAPABILITIES;

  constructor(private readonly config: HubSpotProviderConfig) {
    super();
  }

  protected classifyHttpError(
    status: number,
    body?: unknown,
    retryAfter?: string | null,
  ): CrmError {
    const parsed = (body ?? {}) as HubSpotErrorBody;
    if (
      status === 401 &&
      ["EXPIRED_AUTHENTICATION", "INVALID_AUTHENTICATION"].includes(
        parsed.category ?? "",
      )
    ) {
      return new CrmError(
        "AUTH_EXPIRED",
        true,
        parsed.message ?? "HubSpot access token expired",
        undefined,
        body,
      );
    }
    return super.classifyHttpError(status, body, retryAfter);
  }

  getAuthorizationUrl(params: CrmAuthorizeParams): string {
    const scopes =
      params.scope && params.scope.length > 0
        ? params.scope
        : this.config.scopes;
    const query = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: params.redirectUri,
      response_type: "code",
      state: params.state,
      scope: scopes.join(" "),
    });
    return `${this.config.authorizeUrl}?${query.toString()}`;
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

  async revoke(token: string): Promise<void> {
    // HubSpot revokes refresh tokens, not access tokens.
    await this.request<void>({
      method: "DELETE",
      url: `${this.config.apiBaseUrl}/oauth/v1/refresh-tokens/${encodeURIComponent(token)}`,
    });
  }

  private async tokenRequest(
    body: Record<string, string>,
  ): Promise<CrmTokenSet> {
    const form = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      ...body,
    });
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!response.ok) {
      const parsed = await response.json().catch(() => undefined);
      throw this.classifyHttpError(
        response.status,
        parsed,
        response.headers.get("retry-after"),
      );
    }
    const data = (await response.json()) as HubSpotTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      scopes: data.scope?.split(/\s+/).filter(Boolean),
    };
  }

  async getWorkspaceInfo(creds: CrmCredentials): Promise<CrmWorkspaceInfo> {
    const details = await this.request<{
      hub_id?: number;
      hubId?: number;
      hub_domain?: string;
      hubDomain?: string;
      user?: string;
    }>({
      method: "GET",
      url: `${this.config.apiBaseUrl}/oauth/v1/access-tokens/${encodeURIComponent(creds.accessToken)}`,
    });
    const accountId = String(details.hub_id ?? details.hubId ?? "");
    if (!accountId) {
      throw new CrmError(
        "VALIDATION",
        false,
        "HubSpot did not return a portal id",
      );
    }
    return {
      accountId,
      accountName: details.hub_domain ?? details.hubDomain ?? null,
      metadata: { user: details.user ?? null },
    };
  }

  async searchByPhone(
    creds: CrmCredentials,
    phoneE164: string,
    opts: { limit?: number } = {},
  ): Promise<CrmRecordMatch[]> {
    const candidates = new Map<string, HubSpotObject>();
    for (const propertyName of ["phone", "mobilephone"]) {
      const result = await this.searchObjects(
        creds,
        "contacts",
        propertyName,
        phoneE164,
        CONTACT_PROPERTIES,
        opts.limit ?? 10,
      );
      for (const row of result) candidates.set(row.id, row);
    }
    return [...candidates.values()].map((row) =>
      this.contactToMatch(row, phoneE164),
    );
  }

  async searchByEmail(
    creds: CrmCredentials,
    email: string,
    opts: { limit?: number } = {},
  ): Promise<CrmRecordMatch[]> {
    const rows = await this.searchObjects(
      creds,
      "contacts",
      "email",
      email,
      CONTACT_PROPERTIES,
      opts.limit ?? 10,
    );
    return rows.map((row) => this.contactToMatch(row, ""));
  }

  async searchCompanyByDomain(
    creds: CrmCredentials,
    domain: string,
  ): Promise<CrmCompanyMatch[]> {
    const rows = await this.searchObjects(
      creds,
      "companies",
      "domain",
      domain,
      COMPANY_PROPERTIES,
      10,
    );
    return rows.map((row) => ({
      externalId: row.id,
      externalType: "company",
      name: row.properties.name || domain,
      domain: row.properties.domain ?? null,
      matchedOn: "domain_exact",
      raw: row,
    }));
  }

  private async searchObjects(
    creds: CrmCredentials,
    objectType: "contacts" | "companies",
    propertyName: string,
    value: string,
    properties: string[],
    limit: number,
  ): Promise<HubSpotObject[]> {
    const response = await this.request<HubSpotSearchResponse>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/crm/v3/objects/${objectType}/search`,
      headers: this.authHeaders(creds.accessToken),
      body: {
        filterGroups: [{ filters: [{ propertyName, operator: "EQ", value }] }],
        properties,
        limit: Math.min(limit, 100),
      },
    });
    return response.results ?? [];
  }

  async upsertPerson(
    creds: CrmCredentials,
    input: CrmPersonInput,
  ): Promise<CrmRecordRef> {
    const properties: Record<string, string> = { phone: input.phoneE164 };
    if (input.firstName) properties.firstname = input.firstName;
    if (input.lastName) properties.lastname = input.lastName;
    if (input.email) properties.email = input.email;
    if (input.company) properties.company = input.company;

    const matches = input.email
      ? await this.searchByEmail(creds, input.email, { limit: 1 })
      : await this.searchByPhone(creds, input.phoneE164, { limit: 1 });
    if (matches[0]) {
      const updated = await this.request<HubSpotObject>({
        method: "PATCH",
        url: `${this.config.apiBaseUrl}/crm/v3/objects/contacts/${matches[0].externalId}`,
        headers: this.authHeaders(creds.accessToken),
        body: { properties },
      });
      return { externalId: updated.id, externalType: "person" };
    }
    const created = await this.request<HubSpotObject>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/crm/v3/objects/contacts`,
      headers: this.authHeaders(creds.accessToken),
      body: { properties },
    });
    return { externalId: created.id, externalType: "person" };
  }

  async upsertCompany(
    creds: CrmCredentials,
    input: CrmCompanyInput,
  ): Promise<CrmRecordRef> {
    const properties: Record<string, string> = { name: input.name };
    if (input.domain) properties.domain = input.domain;
    if (input.phoneE164) properties.phone = input.phoneE164;
    if (input.industry) properties.industry = input.industry;
    if (input.size) properties.numberofemployees = input.size;
    if (input.website) properties.website = input.website;

    const match = input.domain
      ? (await this.searchCompanyByDomain(creds, input.domain))[0]
      : undefined;
    const response = await this.request<HubSpotObject>({
      method: match ? "PATCH" : "POST",
      url: match
        ? `${this.config.apiBaseUrl}/crm/v3/objects/companies/${match.externalId}`
        : `${this.config.apiBaseUrl}/crm/v3/objects/companies`,
      headers: this.authHeaders(creds.accessToken),
      body: { properties },
    });
    return { externalId: response.id, externalType: "company" };
  }

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
        "no linked HubSpot record and no creation data",
      );
    }

    const body = this.buildCallBody(input);
    const call = await this.request<HubSpotObject>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/crm/v3/objects/calls`,
      headers: this.authHeaders(creds.accessToken),
      body: {
        properties: {
          hs_timestamp: input.startedAt.toISOString(),
          hs_call_title: `Ringee ${input.direction} call`,
          hs_call_body: body,
          hs_call_direction: input.direction.toUpperCase(),
          hs_call_status: "COMPLETED",
          ...(input.durationSeconds != null
            ? { hs_call_duration: String(input.durationSeconds * 1000) }
            : {}),
          ...(input.recordingUrl
            ? { hs_call_recording_url: input.recordingUrl }
            : {}),
        },
      },
    });
    await this.associateActivity(creds, "calls", call.id, target);
    return { record: target, activityId: call.id };
  }

  async addNote(
    creds: CrmCredentials,
    input: CrmNoteInput,
  ): Promise<CrmRecordRef> {
    const note = await this.request<HubSpotObject>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/crm/v3/objects/notes`,
      headers: this.authHeaders(creds.accessToken),
      body: {
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: [input.title, input.body].filter(Boolean).join("\n\n"),
        },
      },
    });
    await this.associateActivity(creds, "notes", note.id, {
      externalId: input.recordId,
      externalType: input.recordType,
    });
    return { externalId: note.id, externalType: input.recordType };
  }

  async createTask(
    creds: CrmCredentials,
    input: CrmTaskInput,
  ): Promise<CrmRecordRef> {
    const task = await this.request<HubSpotObject>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/crm/v3/objects/tasks`,
      headers: this.authHeaders(creds.accessToken),
      body: {
        properties: {
          hs_timestamp: (input.dueAt ?? new Date()).toISOString(),
          hs_task_subject: input.title,
          hs_task_body: input.body ?? "",
          hs_task_status: "NOT_STARTED",
          hs_task_priority: "MEDIUM",
        },
      },
    });
    for (const record of input.linkedRecords) {
      await this.associateActivity(creds, "tasks", task.id, record);
    }
    return {
      externalId: task.id,
      externalType: input.linkedRecords[0]?.externalType ?? "person",
    };
  }

  async upsertMeeting(
    creds: CrmCredentials,
    input: CrmMeetingInput,
  ): Promise<CrmMeetingSyncResult> {
    const meeting = await this.request<HubSpotObject>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/crm/v3/objects/meetings`,
      headers: this.authHeaders(creds.accessToken),
      body: {
        properties: {
          hs_timestamp: input.startAt.toISOString(),
          hs_meeting_title: input.title,
          hs_meeting_body: [
            input.description,
            input.meetingUrl ? `Join: ${input.meetingUrl}` : null,
            input.ringeeMeetingUrl ? `Ringee: ${input.ringeeMeetingUrl}` : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
          hs_meeting_start_time: input.startAt.toISOString(),
          hs_meeting_end_time: input.endAt.toISOString(),
          hs_internal_meeting_notes: `Ringee id: ${input.ringeeMeetingId}`,
        },
      },
    });
    for (const record of input.linkedRecords) {
      await this.associateActivity(creds, "meetings", meeting.id, record);
    }
    return {
      ref: {
        externalId: meeting.id,
        externalType: input.linkedRecords[0]?.externalType ?? "person",
      },
      syncMode: "hubspot_meeting",
    };
  }

  private associateActivity(
    creds: CrmCredentials,
    activityType: "calls" | "notes" | "tasks" | "meetings",
    activityId: string,
    record: CrmRecordRef,
  ): Promise<void> {
    const targetType =
      record.externalType === "company" ? "companies" : "contacts";
    return this.request<void>({
      method: "PUT",
      url: `${this.config.apiBaseUrl}/crm/v4/objects/${activityType}/${activityId}/associations/default/${targetType}/${record.externalId}`,
      headers: this.authHeaders(creds.accessToken),
    });
  }

  async fetchPerson(
    creds: CrmCredentials,
    externalId: string,
  ): Promise<CrmContactSyncResult> {
    const row = await this.request<HubSpotObject>({
      method: "GET",
      url: `${this.config.apiBaseUrl}/crm/v3/objects/contacts/${externalId}`,
      headers: this.authHeaders(creds.accessToken),
      query: { properties: CONTACT_PROPERTIES.join(",") },
    });
    return this.contactToSync(row);
  }

  async fetchCompany(
    creds: CrmCredentials,
    externalId: string,
  ): Promise<CrmCompanySyncResult> {
    const row = await this.request<HubSpotObject>({
      method: "GET",
      url: `${this.config.apiBaseUrl}/crm/v3/objects/companies/${externalId}`,
      headers: this.authHeaders(creds.accessToken),
      query: { properties: COMPANY_PROPERTIES.join(",") },
    });
    return this.companyToSync(row);
  }

  async listPersons(
    creds: CrmCredentials,
    pageToken?: string | null,
    limit = 50,
  ): Promise<CrmPagedResult<CrmContactSyncResult>> {
    const page = await this.request<HubSpotPage>({
      method: "GET",
      url: `${this.config.apiBaseUrl}/crm/v3/objects/contacts`,
      headers: this.authHeaders(creds.accessToken),
      query: {
        limit: Math.min(limit, 100),
        after: pageToken ?? undefined,
        properties: CONTACT_PROPERTIES.join(","),
        archived: false,
      },
    });
    return {
      data: (page.results ?? []).map((row) => this.contactToSync(row)),
      nextPageToken: page.paging?.next?.after ?? null,
    };
  }

  async listCompanies(
    creds: CrmCredentials,
    pageToken?: string | null,
    limit = 50,
  ): Promise<CrmPagedResult<CrmCompanySyncResult>> {
    const page = await this.request<HubSpotPage>({
      method: "GET",
      url: `${this.config.apiBaseUrl}/crm/v3/objects/companies`,
      headers: this.authHeaders(creds.accessToken),
      query: {
        limit: Math.min(limit, 100),
        after: pageToken ?? undefined,
        properties: COMPANY_PROPERTIES.join(","),
        archived: false,
      },
    });
    return {
      data: (page.results ?? []).map((row) => this.companyToSync(row)),
      nextPageToken: page.paging?.next?.after ?? null,
    };
  }

  async listMembers(creds: CrmCredentials): Promise<CrmOwnerRef[]> {
    const response = await this.request<{ results: HubSpotOwner[] }>({
      method: "GET",
      url: `${this.config.apiBaseUrl}/crm/v3/owners`,
      headers: this.authHeaders(creds.accessToken),
      query: { limit: 500, archived: false },
    });
    return (response.results ?? []).map((owner) => ({
      externalId: owner.id,
      email: owner.email ?? null,
      name: [owner.firstName, owner.lastName].filter(Boolean).join(" ") || null,
    }));
  }

  private contactToMatch(
    row: HubSpotObject,
    requestedPhone: string,
  ): CrmRecordMatch {
    const phones = [row.properties.phone, row.properties.mobilephone]
      .map(normalizePhoneE164)
      .filter((value): value is string => Boolean(value));
    const name =
      [row.properties.firstname, row.properties.lastname]
        .filter(Boolean)
        .join(" ") ||
      row.properties.email ||
      "HubSpot contact";
    return {
      externalId: row.id,
      externalType: "person",
      displayName: name,
      phoneNumbers: phones,
      emails: row.properties.email ? [row.properties.email] : [],
      matchedOn: phones.includes(requestedPhone)
        ? "phone_exact"
        : "phone_suffix",
      raw: row,
    };
  }

  private contactToSync(row: HubSpotObject): CrmContactSyncResult {
    const p = row.properties;
    const phones = [p.phone, p.mobilephone]
      .map(normalizePhoneE164)
      .filter((value): value is string => Boolean(value));
    const displayName =
      [p.firstname, p.lastname].filter(Boolean).join(" ") || p.email || null;
    return {
      contact: { externalId: row.id, externalType: "person" },
      phones,
      emails: p.email ? [p.email] : [],
      firstName: p.firstname ?? null,
      lastName: p.lastname ?? null,
      displayName,
      jobTitle: p.jobtitle ?? null,
      owner: p.hubspot_owner_id
        ? {
            externalId: p.hubspot_owner_id,
            email: null,
            name: null,
          }
        : null,
      company: null,
      customFields: { company: p.company ?? null },
      raw: row,
    };
  }

  private companyToSync(row: HubSpotObject): CrmCompanySyncResult {
    const p = row.properties;
    return {
      company: { externalId: row.id, externalType: "company" },
      name: p.name || p.domain || "HubSpot company",
      domain: p.domain ?? null,
      industry: p.industry ?? null,
      size: p.numberofemployees ?? null,
      phone: normalizePhoneE164(p.phone),
      website: p.website ?? null,
      customFields: {},
      raw: row,
    };
  }

  private buildCallBody(input: CrmCallLogInput): string {
    return [
      `Ringee call ID: ${input.ringeeCallId}`,
      input.from ? `From: ${input.from}` : null,
      input.to ? `To: ${input.to}` : null,
      input.durationSeconds != null
        ? `Duration: ${input.durationSeconds}s`
        : null,
      input.outcomeLabel || input.outcome
        ? `Outcome: ${input.outcomeLabel ?? input.outcome}`
        : null,
      input.agentName || input.agentEmail
        ? `Agent: ${input.agentName ?? input.agentEmail}`
        : null,
      input.summary ? `Summary:\n${input.summary}` : null,
      input.notes ? `Notes:\n${input.notes}` : null,
      input.transcriptUrl ? `Transcript: ${input.transcriptUrl}` : null,
      input.meetingUrl ? `Meeting: ${input.meetingUrl}` : null,
      `Idempotency: ${input.idempotencyKey}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
}
