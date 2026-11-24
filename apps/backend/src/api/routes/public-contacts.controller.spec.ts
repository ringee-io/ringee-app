/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import type { CustomIntegrationApiRequest } from "../guards/custom-integration-api-key.guard";
import { PublicContactsController } from "./public-contacts.controller";

const CTX = { userId: "user-1", organizationId: "org-1" };
const CONTACT_ID = "33333333-3333-4333-8333-333333333333";

const request = {
  customIntegrationAuth: { integration: { id: "integration-1" }, ctx: CTX },
} as unknown as CustomIntegrationApiRequest;

/** A contact row as the database holds it, ownership columns included. */
const row = {
  id: CONTACT_ID,
  userId: "user-1",
  organizationId: "org-1",
  name: "Ada Lovelace",
  firstName: "Ada",
  lastName: "Lovelace",
  phoneNumber: "+14155550100",
  email: "ada@example.com",
  company: "Analytical Engines",
  jobTitle: "Founder",
  locationRegion: "CA",
  websiteUrl: "https://example.com",
  revenue: null,
  companySize: null,
  source: "api",
  lastCallAt: null,
  createdAt: new Date("2026-11-01T10:00:00Z"),
  updatedAt: new Date("2026-11-02T10:00:00Z"),
  encryptedNotes: "secret",
};

function build() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record =
    <T>(method: string, result: T) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
      return result;
    };
  const controller = new PublicContactsController({
    listContacts: record("listContacts", {
      data: [row],
      meta: { total: 41, page: 2, limit: 20, totalPages: 3 },
    }),
    getContactById: record("getContactById", row),
    createContact: record("createContact", row),
    upsertContact: async (...args: unknown[]) => {
      calls.push({ method: "upsertContact", args });
      return { contact: row, created: upsertCreated };
    },
    updateContact: record("updateContact", row),
    deleteConfirmed: record("deleteConfirmed", row),
  } as never);
  let upsertCreated = true;
  return {
    controller,
    calls,
    setUpsertCreated: (value: boolean) => {
      upsertCreated = value;
    },
  };
}

const response = () => {
  const res = {
    statusCode: undefined as number | undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
  return res;
};

describe("public API: contacts (HOOK-009)", () => {
  it("lists the workspace's contacts, paged, without internal columns", async () => {
    const { controller, calls } = build();

    const page = await controller.list(request, "ada", "2", "20");

    assert.deepEqual(calls[0]!.args, [CTX, "ada", undefined, 2, 20]);
    assert.equal(page.total, 41);
    assert.equal(page.totalPages, 3);
    assert.equal(page.data.length, 1);
    assert.equal(page.data[0]!.state, "CA");
    assert.equal(page.data[0]!.website, "https://example.com");
    const serialized = JSON.stringify(page);
    for (const hidden of ["userId", "organizationId", "encryptedNotes"]) {
      assert.equal(serialized.includes(hidden), false, hidden);
    }
  });

  it("treats a blank or wildcard query as list-everything, like the MCP search", async () => {
    for (const query of [undefined, "", "  ", "*"]) {
      const { controller, calls } = build();
      await controller.list(request, query);
      assert.equal(calls[0]!.args[1], undefined);
    }
  });

  it("caps the page size and rejects nonsense", async () => {
    const { controller } = build();
    await assert.rejects(
      controller.list(request, undefined, "0"),
      BadRequestException,
    );
    await assert.rejects(
      controller.list(request, undefined, "1", "101"),
      BadRequestException,
    );
    await assert.rejects(
      controller.list(request, undefined, "1", "ten"),
      BadRequestException,
    );
  });

  it("reads and writes through the integration's workspace, never a client's", async () => {
    const { controller, calls } = build();

    await controller.get(request, CONTACT_ID);
    await controller.create(request, { phoneNumber: "+14155550100" });
    await controller.update(request, CONTACT_ID, { email: "ada@example.com" });
    await controller.remove(request, CONTACT_ID, "+14155550100");

    assert.deepEqual(
      calls.map((call) => [call.method, call.args[0]]),
      [
        ["getContactById", CTX],
        ["createContact", CTX],
        ["updateContact", CTX],
        ["deleteConfirmed", CTX],
      ],
    );
  });

  it("marks contacts written through the API with their source", async () => {
    const { controller, calls } = build();

    await controller.create(request, { phoneNumber: "+14155550100" });
    await controller.create(request, {
      phoneNumber: "+14155550101",
      source: "n8n",
    });

    assert.equal((calls[0]!.args[1] as { source: string }).source, "api");
    assert.equal((calls[1]!.args[1] as { source: string }).source, "n8n");
  });

  it("answers an upsert 201 when it created and 200 when it found", async () => {
    const created = build();
    const res1 = response();
    const first = await created.controller.upsert(
      request,
      { phoneNumber: "+14155550100" },
      res1 as never,
    );
    assert.equal(res1.statusCode, 201);
    assert.equal(first.created, true);

    const found = build();
    found.setUpsertCreated(false);
    const res2 = response();
    const second = await found.controller.upsert(
      request,
      { phoneNumber: "+14155550100" },
      res2 as never,
    );
    assert.equal(res2.statusCode, 200);
    assert.equal(second.created, false);
  });

  it("never clears the required number on a patch that omits it", async () => {
    const { controller, calls } = build();

    await controller.update(request, CONTACT_ID, {
      phoneNumber: null as unknown as undefined,
      name: "Ada",
    });

    const patch = calls[0]!.args[2] as { phoneNumber?: string; name?: string };
    assert.equal(patch.phoneNumber, undefined);
    assert.equal(patch.name, "Ada");
  });

  it("deletes only with the confirmation the service checks, and says what it deleted", async () => {
    const { controller, calls } = build();

    const result = await controller.remove(request, CONTACT_ID, "+14155550100");

    assert.deepEqual(result, { deleted: true, id: CONTACT_ID });
    assert.deepEqual(calls[0]!.args, [CTX, CONTACT_ID, "+14155550100"]);
  });
});
