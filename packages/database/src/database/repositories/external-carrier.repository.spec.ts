import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExternalCarrierRepository } from "./external-carrier.repository";

const ctx = { userId: "creator", organizationId: "org-1" };
const mutation = { ...ctx, carrierId: "carrier-1", token: "lease-1" };

describe("ExternalCarrierRepository isolation and concurrency", () => {
  it("scopes aggregate reads to the organization, independent of its creator", async () => {
    const args: any[] = [];
    const repo = new ExternalCarrierRepository({ externalCarrier: { findMany: async (input: unknown) => { args.push(input); return []; }, findFirst: async (input: unknown) => { args.push(input); return null; } } } as never);
    await repo.list(ctx); await repo.find(ctx, "carrier-1");
    assert.deepEqual(args[0].where, { organizationId: "org-1" });
    assert.deepEqual(args[1].where, { id: "carrier-1", organizationId: "org-1" });
  });

  it("claims only a free/expired lease and releases only the matching owner's token", async () => {
    const args: any[] = [];
    let count = 1;
    const repo = new ExternalCarrierRepository({ externalCarrier: { updateMany: async (input: unknown) => { args.push(input); return { count }; } } } as never);
    assert.equal(await repo.acquire(mutation), true);
    count = 0; assert.equal(await repo.acquire(mutation), false);
    await repo.release(mutation);
    assert.equal(args[0].where.organizationId, "org-1"); assert.equal(args[0].where.OR[0].mutationToken, null);
    assert.ok(args[0].where.OR[1].mutationExpiresAt.lt instanceof Date);
    assert.equal(args[2].where.mutationToken, "lease-1"); assert.equal(args[2].where.organizationId, "org-1");
  });

  it("constrains both source and target of a number reassignment to the locked workspace", async () => {
    let args: any;
    const repo = new ExternalCarrierRepository({ externalPhoneNumber: { update: async (input: unknown) => { args = input; } } } as never);
    await repo.saveNumber(mutation, "endpoint-2", { phoneNumber: "+13055550101", active: true }, "number-1");
    for (const where of [args.where.endpoint.carrier, args.data.endpoint.connect.carrier]) {
      assert.equal(where.id, "carrier-1"); assert.equal(where.organizationId, "org-1"); assert.equal(where.mutationToken, "lease-1"); assert.ok(where.mutationExpiresAt.gt instanceof Date);
    }
  });

  it("deletes dependent local rows in a single transaction, propagating a failed final delete", async () => {
    const calls: string[] = [];
    const repo = new ExternalCarrierRepository({ $transaction: async (operation: (tx: unknown) => Promise<void>) => operation({ externalPhoneNumber: { deleteMany: async (args: any) => { assert.equal(args.where.endpoint.carrier.organizationId, "org-1"); calls.push("numbers"); } }, externalSipEndpoint: { deleteMany: async () => calls.push("endpoints") }, externalCarrier: { delete: async () => { calls.push("carrier"); throw new Error("rollback"); } } }) } as never);
    await assert.rejects(repo.deleteCarrier(mutation), /rollback/);
    assert.deepEqual(calls, ["numbers", "endpoints", "carrier"]);
  });
});
