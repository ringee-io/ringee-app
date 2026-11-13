/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CalendarProvider } from "@prisma/client";
import { CalendarIntegrationRepository } from "./calendar-integration.repository";

/**
 * CAL-004: a calendar account is its workspace's alone. Every read and the
 * reconnect match filter by the workspace — an organization by its id, a
 * personal workspace by its owner and `organizationId: null` — so the same
 * person's other workspace never shows up.
 */

const PERSONAL = { userId: "user-1", organizationId: null };
const ORGANIZATION = { userId: "user-1", organizationId: "org-1" };

type Where = Record<string, unknown>;

function fakePrisma() {
  const reads: Where[] = [];
  const created: Where[] = [];
  const table = {
    findFirst: async ({ where }: { where: Where }) => {
      reads.push(where);
      return null;
    },
    findMany: async ({ where }: { where: Where }) => {
      reads.push(where);
      return [];
    },
    create: async ({ data }: { data: Where }) => {
      created.push(data);
      return { id: "integration-new", ...data };
    },
    update: async () => ({}),
  };
  const tx = { $queryRaw: async () => [], calendarIntegration: table };
  const prisma = {
    calendarIntegration: table,
    $transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
  };
  return {
    repo: new CalendarIntegrationRepository(prisma as never),
    reads,
    created,
  };
}

describe("calendar accounts per workspace (CAL-004)", () => {
  it("reads a personal workspace's accounts by its owner and no organization", async () => {
    const { repo, reads } = fakePrisma();
    await repo.listForWorkspace(PERSONAL);
    await repo.findByIdForOwner(PERSONAL, "integration-1");
    assert.deepEqual(reads, [
      { isActive: true, userId: "user-1", organizationId: null },
      {
        id: "integration-1",
        isActive: true,
        userId: "user-1",
        organizationId: null,
      },
    ]);
  });

  it("reads an organization's accounts by the organization alone", async () => {
    const { repo, reads } = fakePrisma();
    await repo.listForWorkspace(ORGANIZATION);
    await repo.findByIdForOwner(ORGANIZATION, "integration-1");
    assert.deepEqual(reads, [
      { isActive: true, organizationId: "org-1" },
      { id: "integration-1", isActive: true, organizationId: "org-1" },
    ]);
  });

  it("reconnects only an account of the same workspace, and creates it there otherwise", async () => {
    // An organization's account matches whichever member reconnects it.
    const workspaces = [
      [PERSONAL, { userId: "user-1", organizationId: null }],
      [ORGANIZATION, { organizationId: "org-1" }],
    ] as const;
    for (const [ctx, workspace] of workspaces) {
      const { repo, reads, created } = fakePrisma();
      await repo.connectAccount(ctx, CalendarProvider.google, {
        accessToken: "token",
        email: "ana@example.com",
      });
      assert.deepEqual(reads, [
        {
          ...workspace,
          provider: CalendarProvider.google,
          email: "ana@example.com",
        },
      ]);
      assert.equal(created.length, 1);
      assert.equal(created[0]!.userId, "user-1");
      assert.equal(created[0]!.organizationId, ctx.organizationId);
    }
  });

  it("matches an account without an email only to the same person's", async () => {
    const { repo, reads } = fakePrisma();
    await repo.connectAccount(ORGANIZATION, CalendarProvider.google, {
      accessToken: "token",
    });
    assert.deepEqual(reads, [
      {
        organizationId: "org-1",
        userId: "user-1",
        provider: CalendarProvider.google,
        email: null,
      },
    ]);
  });
});
