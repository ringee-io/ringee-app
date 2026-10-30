import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AttioAppService } from "./attio-app.service";

function setup() {
  const registry = new Map<string, string>();
  const prisma = {
    user: { findUnique: async () => ({ blockedAt: null }) },
    organizationMembership: { findFirst: async () => ({ role: "org:admin" }) },
  };
  const crypto = { encrypt: JSON.stringify, decrypt: JSON.parse };
  const redis = {
    set: async (key: string, value: string) => {
      registry.set(key, value);
    },
    getRaw: async (key: string) => registry.get(key) ?? null,
  };
  const service = new AttioAppService(
    prisma as never,
    crypto as never,
    redis as never,
  );
  return { service, registry };
}

describe("Attio token revocation", () => {
  it("never resurrects a rotated token when the registry entry disappears", async () => {
    const { service, registry } = setup();
    const ctx = { userId: "user-1", organizationId: null };
    const old = await service.generateToken(ctx);
    const current = await service.generateToken(ctx);
    await assert.rejects(service.validateToken(old));
    assert.equal((await service.validateToken(current)).userId, ctx.userId);
    registry.clear();
    await assert.rejects(service.validateToken(old));
    await assert.rejects(service.validateToken(current));
    const replacement = await service.generateToken(ctx);
    assert.equal((await service.validateToken(replacement)).userId, ctx.userId);
  });
  it("requires legacy tokens to be regenerated", async () => {
    const { service } = setup();
    await assert.rejects(
      service.validateToken(
        JSON.stringify({
          v: 1,
          userId: "user-1",
          organizationId: null,
          scope: "personal",
          createdAt: 1,
        }),
      ),
    );
  });
});
