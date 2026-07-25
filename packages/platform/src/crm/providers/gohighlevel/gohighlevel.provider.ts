import { Injectable } from "@nestjs/common";
import { CrmProviderType } from "@ringee/database";
import { AbstractCrmProvider } from "../../abstract-provider";
import { CrmError } from "../../errors";
import { normalizePhoneE164, phoneMatchesSuffix } from "../../phone";
import type {
  CrmAuthorizeParams,
  CrmCallLogInput,
  CrmCallLogResult,
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
import { GOHIGHLEVEL_CAPABILITIES } from "./gohighlevel.capabilities";

export type GoHighLevelProviderConfig = {
  clientId: string;
  clientSecret: string;
  versionId?: string;
  apiBaseUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
};

type HighLevelTokenResponse = {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  expires_in?: number;
  expiresIn?: number;
  scope?: string;
  userType?: string;
  locationId?: string;
  companyId?: string;
  userId?: string;
};

type HighLevelContact = {
  id: string;
  locationId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  assignedTo?: string;
  website?: string;
  tags?: string[];
  customFields?: Array<{
    id?: string;
    key?: string;
    value?: unknown;
    fieldValue?: unknown;
  }>;
};

type HighLevelContactPage = {
  contacts?: HighLevelContact[];
  meta?: {
    total?: number;
    nextPageUrl?: string;
    startAfter?: number;
    startAfterId?: string;
  };
};

type HighLevelErrorBody = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
};

type HighLevelPageToken = {
  startAfter?: number;
  startAfterId?: string;
};

@Injectable()
export class GoHighLevelProvider extends AbstractCrmProvider {
  readonly type: CrmProviderType = "gohighlevel";
  readonly capabilities = GOHIGHLEVEL_CAPABILITIES;

  constructor(private readonly config: GoHighLevelProviderConfig) {
    super();
  }

  protected classifyHttpError(
    status: number,
    body?: unknown,
    retryAfter?: string | null,
  ): CrmError {
    const parsed = (body ?? {}) as HighLevelErrorBody;
    const message = Array.isArray(parsed.message)
      ? parsed.message.join(", ")
      : parsed.message;
    if (
      status === 400 &&
      /refresh token.*invalid|invalid grant/i.test(message ?? "")
    ) {
      return new CrmError(
        "AUTH_REVOKED",
        false,
        message ?? "HighLevel refresh token is no longer valid",
        undefined,
        body,
      );
    }
    if (status === 401) {
      return new CrmError(
        "AUTH_EXPIRED",
        true,
        message ?? "HighLevel access token expired",
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
    const authorizeUrl = new URL(this.config.authorizeUrl);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", params.redirectUri);
    authorizeUrl.searchParams.set("scope", scopes.join(" "));
    authorizeUrl.searchParams.set("state", params.state);

    if (this.config.versionId) {
      authorizeUrl.searchParams.set("version_id", this.config.versionId);
      authorizeUrl.searchParams.delete("client_id");
    } else {
      authorizeUrl.searchParams.set("client_id", this.config.clientId);
    }

    return authorizeUrl.toString();
  }

  exchangeCode(params: CrmExchangeParams): Promise<CrmTokenSet> {
    return this.tokenRequest({
      grant_type: "authorization_code",
      code: params.code,
      user_type: "Location",
      redirect_uri: params.redirectUri,
    });
  }

  refreshToken(refreshToken: string): Promise<CrmTokenSet> {
    return this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      user_type: "Location",
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
        Version: "v3",
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
    const data = (await response.json()) as HighLevelTokenResponse;
    const accessToken = data.access_token ?? data.accessToken;
    if (!accessToken) {
      throw new CrmError(
        "VALIDATION",
        false,
        "HighLevel token response did not include an access token",
      );
    }
    const expiresIn = data.expires_in ?? data.expiresIn;
    return {
      accessToken,
      // HighLevel rotates refresh tokens. Returning the new value here is
      // required so CrmConnectionService atomically replaces the old token.
      refreshToken: data.refresh_token ?? data.refreshToken ?? null,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      scopes: data.scope?.split(/\s+/).filter(Boolean),
      accountId: data.locationId ?? null,
      metadata: {
        companyId: data.companyId ?? null,
        userId: data.userId ?? null,
        userType: data.userType ?? "Location",
      },
    };
  }

  async getWorkspaceInfo(creds: CrmCredentials): Promise<CrmWorkspaceInfo> {
    if (!creds.accountId) {
      throw new CrmError(
        "VALIDATION",
        false,
        "HighLevel OAuth did not return a Location id; configure the app target user as Sub-account",
      );
    }
    const response = await this.request<{
      location?: {
        id?: string;
        name?: string;
        companyId?: string;
        timezone?: string;
      };
      id?: string;
      name?: string;
      companyId?: string;
      timezone?: string;
    }>({
      method: "GET",
      url: `${this.config.apiBaseUrl}/locations/${creds.accountId}`,
      headers: this.highLevelHeaders(creds.accessToken, "v3"),
    });
    const location = response.location ?? response;
    return {
      accountId: location.id ?? creds.accountId,
      accountName: location.name ?? null,
      metadata: {
        companyId: location.companyId ?? null,
        timezone: location.timezone ?? null,
        accountKind: "location",
      },
    };
  }

  async searchByPhone(
    creds: CrmCredentials,
    phoneE164: string,
    opts: { limit?: number } = {},
  ): Promise<CrmRecordMatch[]> {
    const contacts = await this.queryContacts(
      creds,
      phoneE164,
      opts.limit ?? 10,
    );
    return contacts
      .filter((contact) => {
        const phone = normalizePhoneE164(contact.phone);
        return phone ? phoneMatchesSuffix(phone, phoneE164) : false;
      })
      .map((contact) => this.contactToMatch(contact, phoneE164));
  }

  async searchByEmail(
    creds: CrmCredentials,
    email: string,
    opts: { limit?: number } = {},
  ): Promise<CrmRecordMatch[]> {
    const contacts = await this.queryContacts(creds, email, opts.limit ?? 10);
    return contacts
      .filter((contact) => contact.email?.toLowerCase() === email.toLowerCase())
      .map((contact) => this.contactToMatch(contact, ""));
  }

  private async queryContacts(
    creds: CrmCredentials,
    query: string,
    limit: number,
  ): Promise<HighLevelContact[]> {
    // The legacy list route remains the documented fallback for the v3
    // advanced-search endpoint and supports a simple phone/email query.
    const response = await this.request<HighLevelContactPage>({
      method: "GET",
      url: `${this.config.apiBaseUrl}/contacts/`,
      headers: this.highLevelHeaders(creds.accessToken, "2021-07-28"),
      query: {
        locationId: creds.accountId,
        query,
        limit: Math.min(limit, 100),
      },
    });
    return response.contacts ?? [];
  }

  async upsertPerson(
    creds: CrmCredentials,
    input: CrmPersonInput,
  ): Promise<CrmRecordRef> {
    const response = await this.request<{
      contact: HighLevelContact;
      new?: boolean;
    }>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/contacts/upsert`,
      headers: this.highLevelHeaders(creds.accessToken, "v3"),
      body: {
        locationId: creds.accountId,
        firstName: input.firstName ?? undefined,
        lastName: input.lastName ?? undefined,
        name: input.displayName ?? undefined,
        email: input.email ?? undefined,
        phone: input.phoneE164,
        companyName: input.company ?? undefined,
        source: "Ringee",
        createNewIfDuplicateAllowed: false,
      },
    });
    return { externalId: response.contact.id, externalType: "person" };
  }

  async logCall(
    creds: CrmCredentials,
    input: CrmCallLogInput,
  ): Promise<CrmCallLogResult> {
    let target = input.linkedRecords.find(
      (record) => record.externalType === "person",
    );
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
        "no linked HighLevel contact and no creation data",
      );
    }
    const note = await this.createContactNote(
      creds,
      target.externalId,
      this.buildCallNote(input),
    );
    return { record: target, activityId: note.id ?? null };
  }

  async addNote(
    creds: CrmCredentials,
    input: CrmNoteInput,
  ): Promise<CrmRecordRef> {
    if (input.recordType !== "person") {
      throw new CrmError(
        "VALIDATION",
        false,
        "HighLevel notes require a contact record",
      );
    }
    const note = await this.createContactNote(
      creds,
      input.recordId,
      [input.title, input.body].filter(Boolean).join("\n\n"),
    );
    return {
      externalId: note.id ?? input.recordId,
      externalType: "person",
    };
  }

  async createTask(
    creds: CrmCredentials,
    input: CrmTaskInput,
  ): Promise<CrmRecordRef> {
    const target = input.linkedRecords.find(
      (record) => record.externalType === "person",
    );
    if (!target) {
      throw new CrmError(
        "VALIDATION",
        false,
        "HighLevel tasks require a contact record",
      );
    }
    const response = await this.request<{
      task?: { id?: string };
      id?: string;
    }>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/contacts/${target.externalId}/tasks`,
      headers: this.highLevelHeaders(creds.accessToken, "v3"),
      body: {
        title: input.title,
        body: input.body ?? "",
        dueDate: (input.dueAt ?? new Date()).toISOString(),
        completed: false,
      },
    });
    return {
      externalId: response.task?.id ?? response.id ?? target.externalId,
      externalType: "person",
    };
  }

  async upsertMeeting(
    creds: CrmCredentials,
    input: CrmMeetingInput,
  ): Promise<CrmMeetingSyncResult> {
    const target = input.linkedRecords.find(
      (record) => record.externalType === "person",
    );
    if (!target) {
      throw new CrmError(
        "VALIDATION",
        false,
        "HighLevel meeting sync requires a contact",
      );
    }
    const note = await this.createContactNote(
      creds,
      target.externalId,
      [
        `Meeting: ${input.title}`,
        `${input.startAt.toISOString()} – ${input.endAt.toISOString()}`,
        input.description,
        input.meetingUrl ? `Join: ${input.meetingUrl}` : null,
        input.ringeeMeetingUrl ? `Ringee: ${input.ringeeMeetingUrl}` : null,
        `Ringee meeting ID: ${input.ringeeMeetingId}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    return {
      ref: {
        externalId: note.id ?? target.externalId,
        externalType: "person",
      },
      syncMode: "highlevel_contact_note",
    };
  }

  async fetchPerson(
    creds: CrmCredentials,
    externalId: string,
  ): Promise<CrmContactSyncResult> {
    const response = await this.request<
      {
        contact?: HighLevelContact;
      } & HighLevelContact
    >({
      method: "GET",
      url: `${this.config.apiBaseUrl}/contacts/${externalId}`,
      headers: this.highLevelHeaders(creds.accessToken, "v3"),
    });
    return this.contactToSync(response.contact ?? response);
  }

  async listPersons(
    creds: CrmCredentials,
    pageToken?: string | null,
    limit = 50,
  ): Promise<CrmPagedResult<CrmContactSyncResult>> {
    const cursor = this.decodePageToken(pageToken);
    const response = await this.request<HighLevelContactPage>({
      method: "GET",
      url: `${this.config.apiBaseUrl}/contacts/`,
      headers: this.highLevelHeaders(creds.accessToken, "2021-07-28"),
      query: {
        locationId: creds.accountId,
        limit: Math.min(limit, 100),
        startAfter: cursor.startAfter,
        startAfterId: cursor.startAfterId,
      },
    });
    const contacts = response.contacts ?? [];
    const next = this.nextPageToken(response);
    return {
      data: contacts.map((contact) => this.contactToSync(contact)),
      nextPageToken: next,
    };
  }

  async listMembers(creds: CrmCredentials): Promise<CrmOwnerRef[]> {
    const response = await this.request<{
      users?: Array<{
        id: string;
        name?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
      }>;
    }>({
      method: "GET",
      url: `${this.config.apiBaseUrl}/users/`,
      headers: this.highLevelHeaders(creds.accessToken, "2021-07-28"),
      query: { locationId: creds.accountId },
    });
    return (response.users ?? []).map((user) => ({
      externalId: user.id,
      email: user.email ?? null,
      name:
        user.name ??
        ([user.firstName, user.lastName].filter(Boolean).join(" ") || null),
    }));
  }

  private createContactNote(
    creds: CrmCredentials,
    contactId: string,
    body: string,
  ): Promise<{ id?: string; note?: { id?: string } }> {
    return this.request<{
      id?: string;
      note?: { id?: string };
    }>({
      method: "POST",
      url: `${this.config.apiBaseUrl}/contacts/${contactId}/notes`,
      headers: this.highLevelHeaders(creds.accessToken, "v3"),
      body: { body },
    }).then((response) => ({
      id: response.note?.id ?? response.id,
      note: response.note,
    }));
  }

  private contactToMatch(
    contact: HighLevelContact,
    requestedPhone: string,
  ): CrmRecordMatch {
    const phone = normalizePhoneE164(contact.phone);
    return {
      externalId: contact.id,
      externalType: "person",
      displayName:
        contact.name ??
        ([contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
          contact.email ||
          "HighLevel contact"),
      phoneNumbers: phone ? [phone] : [],
      emails: contact.email ? [contact.email] : [],
      matchedOn:
        phone && phone === requestedPhone ? "phone_exact" : "phone_suffix",
      raw: contact,
    };
  }

  private contactToSync(contact: HighLevelContact): CrmContactSyncResult {
    const phone = normalizePhoneE164(contact.phone);
    const customFields: Record<string, unknown> = {};
    for (const field of contact.customFields ?? []) {
      const key = field.key ?? field.id;
      if (key) customFields[key] = field.fieldValue ?? field.value ?? null;
    }
    if (contact.companyName) customFields.companyName = contact.companyName;
    if (contact.tags) customFields.tags = contact.tags;
    if (contact.website) customFields.website = contact.website;

    return {
      contact: { externalId: contact.id, externalType: "person" },
      phones: phone ? [phone] : [],
      emails: contact.email ? [contact.email] : [],
      firstName: contact.firstName ?? null,
      lastName: contact.lastName ?? null,
      displayName:
        contact.name ??
        ([contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
          contact.email ||
          null),
      jobTitle: null,
      owner: contact.assignedTo
        ? { externalId: contact.assignedTo, email: null, name: null }
        : null,
      company: null,
      customFields,
      raw: contact,
    };
  }

  private highLevelHeaders(
    accessToken: string,
    version: "v3" | "2021-07-28",
  ): Record<string, string> {
    return {
      ...this.authHeaders(accessToken),
      Version: version,
    };
  }

  private decodePageToken(pageToken?: string | null): HighLevelPageToken {
    if (!pageToken) return {};
    try {
      return JSON.parse(
        Buffer.from(pageToken, "base64url").toString("utf8"),
      ) as HighLevelPageToken;
    } catch {
      throw new CrmError("VALIDATION", false, "invalid HighLevel page token");
    }
  }

  private nextPageToken(response: HighLevelContactPage): string | null {
    const meta = response.meta;
    if (meta?.startAfterId || meta?.startAfter) {
      return Buffer.from(
        JSON.stringify({
          startAfterId: meta.startAfterId,
          startAfter: meta.startAfter,
        }),
      ).toString("base64url");
    }
    if (meta?.nextPageUrl) {
      try {
        const next = new URL(meta.nextPageUrl);
        const startAfter = next.searchParams.get("startAfter");
        const startAfterId = next.searchParams.get("startAfterId");
        if (startAfter || startAfterId) {
          return Buffer.from(
            JSON.stringify({
              startAfter: startAfter ? Number(startAfter) : undefined,
              startAfterId: startAfterId ?? undefined,
            }),
          ).toString("base64url");
        }
      } catch {
        // Invalid provider cursor: stop here instead of replaying the page.
      }
    }
    // Never synthesize a cursor from only the contact id: the legacy endpoint
    // requires its timestamp pair and would otherwise replay the first page.
    return null;
  }

  private buildCallNote(input: CrmCallLogInput): string {
    return [
      `Ringee ${input.direction} call`,
      `Started: ${input.startedAt.toISOString()}`,
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
      input.recordingUrl ? `Recording: ${input.recordingUrl}` : null,
      input.transcriptUrl ? `Transcript: ${input.transcriptUrl}` : null,
      input.meetingUrl ? `Meeting: ${input.meetingUrl}` : null,
      `Ringee call ID: ${input.ringeeCallId}`,
      `Idempotency: ${input.idempotencyKey}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
}
