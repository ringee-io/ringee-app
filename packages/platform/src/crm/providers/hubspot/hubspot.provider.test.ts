import { afterEach, describe, expect, it, vi } from "vitest";
import { CrmError } from "../../errors";
import type { CrmCallLogInput, CrmCredentials } from "../../types";
import { HUBSPOT_CALL_DISPOSITION } from "./hubspot.api";
import { classifyHubSpotHttpError } from "./hubspot.errors";
import {
  HubSpotProvider,
  type HubSpotProviderConfig,
} from "./hubspot.provider";

const API = "https://api.hubapi.test";

const credentials: CrmCredentials = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accountId: "123",
  connectionId: "connection-1",
};

function provider(overrides: Partial<HubSpotProviderConfig> = {}) {
  return new HubSpotProvider({
    clientId: "client-id",
    clientSecret: "client-secret",
    apiBaseUrl: API,
    authorizeUrl: "https://app.hubspot.test/oauth/authorize",
    scopes: ["oauth", "crm.objects.contacts.read"],
    optionalScopes: ["files.write"],
    ...overrides,
  });
}

type Recorded = { method: string; url: URL; body: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Routes every fetch through `handler` and records what was sent. */
function stubFetch(handler: (request: Recorded) => Response): Recorded[] {
  const requests: Recorded[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const raw = init?.body;
      let body: unknown = raw;
      if (typeof raw === "string") {
        try {
          body = JSON.parse(raw);
        } catch {
          body = Object.fromEntries(new URLSearchParams(raw));
        }
      }
      const request = {
        method: init?.method ?? "GET",
        url: new URL(String(input)),
        body,
      };
      requests.push(request);
      return handler(request);
    }),
  );
  return requests;
}

function unexpected(request: Recorded): never {
  throw new Error(`Unexpected request: ${request.method} ${request.url}`);
}

function callInput(overrides: Partial<CrmCallLogInput> = {}): CrmCallLogInput {
  return {
    idempotencyKey: "key-1",
    ringeeCallId: "call-1",
    direction: "outbound",
    from: "+14155550000",
    to: "+14155552671",
    startedAt: new Date("2026-09-01T10:00:00.000Z"),
    durationSeconds: 90,
    outcome: "interested",
    outcomeLabel: "Interested",
    linkedRecords: [{ externalId: "101", externalType: "person" }],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HubSpotProvider OAuth", () => {
  it("builds the install URL with space-separated scopes", () => {
    const url = new URL(
      provider().getAuthorizationUrl({
        state: "state-1",
        redirectUri: "https://api.ringee.test/api/crm/hubspot/oauth/callback",
      }),
    );

    expect(url.origin + url.pathname).toBe(
      "https://app.hubspot.test/oauth/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("scope")).toBe(
      "oauth crm.objects.contacts.read",
    );
    expect(url.searchParams.get("optional_scope")).toBe("files.write");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.search).toContain("scope=oauth%20crm.objects.contacts.read");
  });

  it("refuses to start OAuth without a configured client", () => {
    let failure: unknown;
    try {
      provider({ clientId: "" }).getAuthorizationUrl({
        state: "s",
        redirectUri: "https://x.test/cb",
      });
    } catch (err) {
      failure = err;
    }

    expect(failure).toBeInstanceOf(CrmError);
    expect((failure as CrmError).code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("exchanges the code on the versioned endpoint with credentials in the body", async () => {
    const requests = stubFetch((request) =>
      request.url.pathname === "/oauth/2026-09/token"
        ? json({
            access_token: "new-access",
            refresh_token: "new-refresh",
            expires_in: 1800,
            hub_id: 123,
            scopes: ["oauth", "crm.objects.contacts.read"],
          })
        : unexpected(request),
    );

    const tokens = await provider().exchangeCode({
      code: "auth-code",
      redirectUri: "https://x.test/cb",
    });

    expect(tokens).toMatchObject({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      scopes: ["oauth", "crm.objects.contacts.read"],
    });
    expect(tokens.expiresAt).toBeInstanceOf(Date);
    expect(requests[0].url.search).toBe("");
    expect(requests[0].body).toEqual({
      client_id: "client-id",
      client_secret: "client-secret",
      grant_type: "authorization_code",
      code: "auth-code",
      redirect_uri: "https://x.test/cb",
    });
  });

  it("treats a rejected refresh token as a revocation", async () => {
    stubFetch(() =>
      json(
        {
          error: "invalid_grant",
          error_description: "refresh token is invalid, expired or revoked",
          status: "BAD_REFRESH_TOKEN",
        },
        400,
      ),
    );
    const hubspot = provider();

    const failure = await hubspot.refreshToken("dead").catch((err) => err);

    expect(failure).toBeInstanceOf(CrmError);
    expect(failure.code).toBe("AUTH_REVOKED");
    expect(hubspot.isRefreshFailureTerminal(failure)).toBe(true);
  });

  it("identifies the portal and the optional scopes it granted", async () => {
    const requests = stubFetch((request) =>
      request.url.pathname === "/oauth/2026-09/token/introspect"
        ? json({
            active: true,
            hub_id: 123,
            hub_domain: "acme.com",
            app_id: 9,
            scopes: ["oauth", "crm.objects.contacts.read", "crm.lists.read"],
          })
        : unexpected(request),
    );

    const info = await provider().getWorkspaceInfo(credentials);

    expect(info).toEqual({
      accountId: "123",
      accountName: "acme.com",
      capabilities: { supportsLists: true, supportsRecordingUpload: false },
      metadata: { hubId: 123, hubDomain: "acme.com", appId: 9 },
    });
    expect(requests[0].body).toMatchObject({
      token: "access-token",
      token_type_hint: "access_token",
    });
  });
});

describe("classifyHubSpotHttpError", () => {
  it("never reads a missing scope as a revoked connection", () => {
    const err = classifyHubSpotHttpError(403, {
      status: "error",
      category: "MISSING_SCOPES",
      message: "This app hasn't been granted all required scopes",
    });
    expect(err.code).toBe("VALIDATION");
    expect(err.retryable).toBe(false);
  });

  it("asks for a refresh on 401", () => {
    const err = classifyHubSpotHttpError(401, {
      category: "EXPIRED_AUTHENTICATION",
    });
    expect(err.code).toBe("AUTH_EXPIRED");
    expect(err.retryable).toBe(true);
  });

  it("waits out the rate-limit window HubSpot names", () => {
    const err = classifyHubSpotHttpError(429, {
      errorType: "RATE_LIMIT",
      policyName: "TEN_SECONDLY_ROLLING",
    });
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.retryAfterMs).toBe(10_000);
    expect(classifyHubSpotHttpError(429, {}, "3").retryAfterMs).toBe(3_000);
  });

  it("retries a locked record after HubSpot's two-second lock", () => {
    const err = classifyHubSpotHttpError(423, {});
    expect(err.code).toBe("TRANSIENT");
    expect(err.retryAfterMs).toBe(2_000);
  });
});

describe("HubSpotProvider.searchByPhone", () => {
  it("keeps only contacts whose numbers really match", async () => {
    const requests = stubFetch((request) =>
      request.url.pathname === "/crm/objects/2026-09/contacts/search"
        ? json({
            results: [
              { id: "1", properties: { phone: "(415) 555-2671" } },
              { id: "2", properties: { phone: "+14155559999" } },
            ],
          })
        : unexpected(request),
    );

    const matches = await provider().searchByPhone(credentials, "+14155552671");

    expect(matches.map((match) => match.externalId)).toEqual(["1"]);
    expect(matches[0].matchedOn).toBe("phone_exact");
    const search = requests[0].body as {
      filterGroups: Array<{ filters: Array<{ value: string }> }>;
    };
    expect(search.filterGroups[0].filters[0].value).toBe("4155552671");
  });

  it("falls back to the typed phone properties when a filter is rejected", async () => {
    let call = 0;
    const requests = stubFetch(() =>
      call++ === 0
        ? json({ status: "error", category: "VALIDATION_ERROR" }, 400)
        : json({
            results: [{ id: "1", properties: { phone: "+14155552671" } }],
          }),
    );

    const matches = await provider().searchByPhone(credentials, "+14155552671");

    expect(matches).toHaveLength(1);
    const retry = requests[1].body as { filterGroups: unknown[] };
    expect(retry.filterGroups).toHaveLength(2);
  });
});

describe("HubSpotProvider.upsertPerson", () => {
  it("creates a contact when neither the e-mail nor the phone is known", async () => {
    const requests = stubFetch((request) => {
      const path = request.url.pathname;
      if (path === "/crm/objects/2026-09/contacts/ada%40example.com") {
        return json({ status: "error", category: "OBJECT_NOT_FOUND" }, 404);
      }
      if (path === "/crm/objects/2026-09/contacts/search") {
        return json({ results: [] });
      }
      if (
        path === "/crm/objects/2026-09/contacts" &&
        request.method === "POST"
      ) {
        return json({ id: "501", properties: {} }, 201);
      }
      return unexpected(request);
    });

    const ref = await provider().upsertPerson(credentials, {
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      phoneE164: "+14155552671",
    });

    expect(ref).toEqual({ externalId: "501", externalType: "person" });
    expect(requests[0].url.searchParams.get("idProperty")).toBe("email");
    expect(requests.at(-1)?.body).toEqual({
      properties: {
        phone: "+14155552671",
        firstname: "Ada",
        lastname: "Lovelace",
        email: "ada@example.com",
      },
    });
  });

  it("only fills the gaps of the contact that owns the e-mail", async () => {
    const requests = stubFetch((request) => {
      if (request.method === "GET") {
        return json({
          id: "77",
          properties: {
            email: "ada@example.com",
            firstname: "Ada",
            lastname: null,
            phone: "+14155550000",
          },
        });
      }
      if (request.method === "PATCH") return json({ id: "77", properties: {} });
      return unexpected(request);
    });

    const ref = await provider().upsertPerson(credentials, {
      displayName: "Augusta Byron",
      email: "ada@example.com",
      phoneE164: "+14155552671",
    });

    expect(ref.externalId).toBe("77");
    const patch = requests.find((request) => request.method === "PATCH");
    expect(patch?.url.pathname).toBe("/crm/objects/2026-09/contacts/77");
    expect(patch?.body).toEqual({ properties: { lastname: "Byron" } });
  });

  it("adopts the contact that won a concurrent create", async () => {
    stubFetch((request) => {
      if (request.method === "GET") return json({}, 404);
      if (request.url.pathname.endsWith("/search"))
        return json({ results: [] });
      return json(
        {
          status: "error",
          category: "CONFLICT",
          message: "Contact already exists. Existing ID: 9001",
        },
        409,
      );
    });

    const ref = await provider().upsertPerson(credentials, {
      email: "ada@example.com",
      phoneE164: "+14155552671",
    });

    expect(ref).toEqual({ externalId: "9001", externalType: "person" });
  });
});

describe("HubSpotProvider.logCall", () => {
  it("logs a native call associated with the contact", async () => {
    const requests = stubFetch((request) => {
      if (request.url.pathname === "/crm/objects/2026-09/calls/search") {
        return json({ results: [] });
      }
      if (request.url.pathname === "/crm/objects/2026-09/calls") {
        return json({ id: "call-9", properties: {} }, 201);
      }
      return unexpected(request);
    });

    const result = await provider().logCall(credentials, callInput());

    expect(result).toEqual({
      record: { externalId: "101", externalType: "person" },
      activityId: "call-9",
    });
    const dedupe = requests[0].body as {
      filterGroups: Array<{ filters: Array<Record<string, string>> }>;
    };
    expect(dedupe.filterGroups[0].filters).toEqual([
      { propertyName: "associations.contact", operator: "EQ", value: "101" },
      {
        propertyName: "hs_timestamp",
        operator: "EQ",
        value: String(new Date("2026-09-01T10:00:00.000Z").getTime()),
      },
      { propertyName: "hs_call_direction", operator: "EQ", value: "OUTBOUND" },
    ]);
    const create = requests[1].body as {
      properties: Record<string, string>;
      associations: unknown;
    };
    expect(create.properties.hs_call_disposition).toBe(
      HUBSPOT_CALL_DISPOSITION.connected,
    );
    expect(create.associations).toEqual([
      {
        to: { id: "101" },
        types: [
          { associationCategory: "HUBSPOT_DEFINED", associationTypeId: 194 },
        ],
      },
    ]);
  });

  it("does not log a call twice when a retry finds it already there", async () => {
    const requests = stubFetch((request) =>
      request.url.pathname === "/crm/objects/2026-09/calls/search"
        ? json({ results: [{ id: "call-1", properties: {} }] })
        : unexpected(request),
    );

    const result = await provider().logCall(credentials, callInput());

    expect(result.activityId).toBe("call-1");
    expect(requests).toHaveLength(1);
  });

  it("logs the call without an outcome the portal deleted", async () => {
    const creates: Array<Record<string, string>> = [];
    stubFetch((request) => {
      if (request.url.pathname.endsWith("/search"))
        return json({ results: [] });
      const body = request.body as { properties: Record<string, string> };
      creates.push(body.properties);
      return creates.length === 1
        ? json(
            {
              status: "error",
              category: "VALIDATION_ERROR",
              message: "Property values were not valid: hs_call_disposition",
            },
            400,
          )
        : json({ id: "call-10", properties: {} }, 201);
    });

    const result = await provider().logCall(credentials, callInput());

    expect(result.activityId).toBe("call-10");
    expect(creates[0]).toHaveProperty("hs_call_disposition");
    expect(creates[1]).not.toHaveProperty("hs_call_disposition");
  });

  it("logs against a company with the company association type", async () => {
    const requests = stubFetch((request) =>
      request.url.pathname.endsWith("/search")
        ? json({ results: [] })
        : json({ id: "call-11", properties: {} }, 201),
    );

    await provider().logCall(
      credentials,
      callInput({
        linkedRecords: [{ externalId: "900", externalType: "company" }],
      }),
    );

    const create = requests[1].body as {
      associations: Array<{ types: Array<{ associationTypeId: number }> }>;
    };
    expect(create.associations[0].types[0].associationTypeId).toBe(182);
  });
});

describe("HubSpotProvider.addNote", () => {
  it("renders the markdown body as HTML on a note", async () => {
    const requests = stubFetch(() =>
      json({ id: "note-1", properties: {} }, 201),
    );

    const ref = await provider().addNote(credentials, {
      recordId: "101",
      recordType: "person",
      title: "Call Transcript",
      body: "[View transcript](https://ringee.test/t/1)",
    });

    expect(ref).toEqual({ externalId: "note-1", externalType: "person" });
    const create = requests[0].body as {
      properties: Record<string, string>;
      associations: Array<{ types: Array<{ associationTypeId: number }> }>;
    };
    expect(requests[0].url.pathname).toBe("/crm/objects/2026-09/notes");
    expect(create.properties.hs_note_body).toContain(
      "<p><strong>Call Transcript</strong></p>",
    );
    expect(create.properties.hs_note_body).toContain(
      'href="https://ringee.test/t/1"',
    );
    expect(create.associations[0].types[0].associationTypeId).toBe(202);
  });
});

describe("HubSpotProvider.uploadRecording", () => {
  it("uploads a private file once and attaches it to a note", async () => {
    const requests = stubFetch((request) => {
      if (request.url.pathname === "/files/2026-09/files") {
        return json({ id: "file-1", name: "rec" }, 201);
      }
      if (request.url.pathname === "/crm/objects/2026-09/notes/search") {
        return json({ results: [] });
      }
      if (request.url.pathname === "/crm/objects/2026-09/notes") {
        return json({ id: "note-2", properties: {} }, 201);
      }
      return unexpected(request);
    });

    const result = await provider().uploadRecording(credentials, {
      idempotencyKey: "rec-key",
      recordingId: "rec-1",
      callId: "call-1",
      fileName: "ana-interested-rec-1.mp3",
      fileBuffer: Buffer.from("mp3"),
      fileMimeType: "audio/mpeg",
      fileSizeBytes: 3,
      linkedRecords: [{ externalId: "101", externalType: "person" }],
    });

    expect(result).toEqual({
      ref: { externalId: "note-2", externalType: "person" },
      externalFileId: "file-1",
      syncMode: "hubspot_note_attachment",
    });
    const upload = requests[0].body as FormData;
    expect(upload.get("folderPath")).toBe("/ringee/recordings");
    expect(JSON.parse(String(upload.get("options")))).toMatchObject({
      access: "PRIVATE",
      duplicateValidationStrategy: "RETURN_EXISTING",
      duplicateValidationScope: "EXACT_FOLDER",
    });
    const note = requests[2].body as { properties: Record<string, string> };
    expect(note.properties.hs_attachment_ids).toBe("file-1");
  });
});

describe("HubSpotProvider bulk sync", () => {
  it("pages contacts with HubSpot's cursor", async () => {
    const requests = stubFetch(() =>
      json({
        results: [{ id: "1", properties: { phone: "+14155552671" } }],
        paging: { next: { after: "cursor-2" } },
      }),
    );

    const page = await provider().listPersons(credentials, "cursor-1", 50);

    expect(page.nextPageToken).toBe("cursor-2");
    expect(page.data[0].phones).toEqual(["+14155552671"]);
    expect(requests[0].url.pathname).toBe("/crm/objects/2026-09/contacts");
    expect(requests[0].url.searchParams.get("after")).toBe("cursor-1");
    expect(requests[0].url.searchParams.get("properties")).toContain(
      "hs_calculated_phone_number",
    );
  });

  it("lists contact segments only", async () => {
    stubFetch(() =>
      json({
        lists: [
          {
            listId: 1,
            name: "Prospects",
            objectTypeId: "0-1",
            additionalProperties: { hs_list_size: "42" },
          },
          { listId: 2, name: "Target accounts", objectTypeId: "0-2" },
        ],
        hasMore: false,
      }),
    );

    await expect(provider().listLists(credentials)).resolves.toEqual([
      { externalId: "1", name: "Prospects", memberCount: 42 },
    ]);
  });
});
