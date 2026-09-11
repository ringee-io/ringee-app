import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmCredentials } from "../../types";
import { AttioProvider } from "./attio.provider";

const credentials: CrmCredentials = {
  accessToken: "access-token",
  refreshToken: null,
  accountId: "workspace-1",
  connectionId: "connection-1",
};

function provider(): AttioProvider {
  return new AttioProvider({
    clientId: "client-id",
    clientSecret: "client-secret",
    apiBaseUrl: "https://api.attio.test",
    authorizeUrl: "https://app.attio.test/authorize",
    tokenUrl: "https://app.attio.test/oauth/token",
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AttioProvider.listPersons", () => {
  it("recovers phone and email values stored on an Attio list entry", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        requests.push({ url, body });

        if (url.endsWith("/v2/objects/people/records/query")) {
          return jsonResponse({
            data: [
              {
                id: {
                  workspace_id: "workspace-1",
                  object_id: "people",
                  record_id: "person-with-standard-phone",
                },
                values: {
                  phone_numbers: [
                    {
                      attribute_type: "phone-number",
                      normalized_phone_number: "+14155552671",
                    },
                  ],
                },
              },
              {
                id: {
                  workspace_id: "workspace-1",
                  object_id: "people",
                  record_id: "person-with-list-phone",
                },
                values: {},
              },
            ],
          });
        }

        if (url.endsWith("/v2/lists")) {
          return jsonResponse({
            data: [
              {
                id: { list_id: "prospects-list-id" },
                api_slug: "prospects",
                name: "Prospects",
                parent_object: ["people"],
                workspace_access: "full-access",
              },
            ],
          });
        }

        if (url.endsWith("/v2/lists/prospects-list-id/entries/query")) {
          return jsonResponse({
            data: [
              {
                id: {
                  workspace_id: "workspace-1",
                  list_id: "prospects-list-id",
                  entry_id: "entry-1",
                },
                parent_record_id: "person-with-list-phone",
                parent_object: "people",
                entry_values: {
                  mobile: [
                    {
                      attribute_type: "phone-number",
                      original_phone_number: "809-555-1234",
                      normalized_phone_number: "+18095551234",
                      country_code: "DO",
                    },
                  ],
                  work_email: [
                    {
                      attribute_type: "email-address",
                      email_address: "prospect@example.com",
                    },
                  ],
                },
              },
            ],
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const result = await provider().listPersons(credentials, null, 50);

    expect(result.data).toHaveLength(2);
    expect(result.data[0].phones).toEqual(["+14155552671"]);
    expect(result.data[1].phones).toEqual(["+18095551234"]);
    expect(result.data[1].emails).toEqual(["prospect@example.com"]);

    const entryRequest = requests.find((request) =>
      request.url.endsWith("/v2/lists/prospects-list-id/entries/query"),
    );
    expect(entryRequest?.body).toMatchObject({
      filter: {
        path: [
          ["prospects", "parent_record"],
          ["people", "record_id"],
        ],
        constraints: { value: "person-with-list-phone" },
      },
      limit: 500,
      offset: 0,
    });
  });

  it("keeps the standard person sync working when list access is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/v2/objects/people/records/query")) {
          return jsonResponse({
            data: [
              {
                id: {
                  workspace_id: "workspace-1",
                  object_id: "people",
                  record_id: "person-1",
                },
                values: { name: [{ full_name: "No Phone" }] },
              },
            ],
          });
        }
        if (url.endsWith("/v2/lists")) {
          return jsonResponse({ message: "missing scope" }, 403);
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const result = await provider().listPersons(credentials, null, 50);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].displayName).toBe("No Phone");
    expect(result.data[0].phones).toEqual([]);
  });
});
