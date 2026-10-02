/// <reference types="node" />

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  Prisma,
  type CliAuthRequest,
  CliAuthRequestRepository,
  PersonalApiKey,
} from "@ringee/database";
import type { RedisService } from "@ringee/platform";
import { CliAuthService } from "./cli-auth.service";
import { McpUsageService } from "./mcp-usage.service";
import type { OrganizationService } from "../organization.service";
import { PersonalApiKeyService } from "./personal-api-key.service";

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

/** In-memory stand-in with the same compare-and-set semantics. */
class FakeCliAuthRepo {
  rows: CliAuthRequest[] = [];
  keys: PersonalApiKey[] = [];

  async create(data: Partial<CliAuthRequest>) {
    const row = {
      id: `req-${this.rows.length + 1}`,
      status: "pending",
      userId: null,
      apiKeyId: null,
      decidedAt: null,
      consumedAt: null,
      createdAt: new Date(),
      ...data,
    } as CliAuthRequest;
    this.rows.push(row);
    return row;
  }
  async findByUserCode(userCode: string) {
    return this.rows.find((r) => r.userCode === userCode) ?? null;
  }
  async findByDeviceCodeHash(hash: string) {
    return this.rows.find((r) => r.deviceCodeHash === hash) ?? null;
  }
  async decide(id: string, status: "approved" | "denied", userId: string) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.status !== "pending" || row.expiresAt <= new Date()) {
      return false;
    }
    Object.assign(row, { status, userId, decidedAt: new Date() });
    return true;
  }
  async consumeWithKey(
    id: string,
    key: { userId: string; name: string; prefix: string; keyHash: string },
  ) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.status !== "approved" || row.userId !== key.userId) {
      return null;
    }
    row.status = "consumed";
    const created = {
      id: `key-${this.keys.length + 1}`,
      ...key,
    } as PersonalApiKey;
    this.keys.push(created);
    row.apiKeyId = created.id;
    return created;
  }
  async deleteExpiredBefore() {}
}

class FakeRedis {
  counters = new Map<string, number>();
  down = false;
  assertUp() {
    if (this.down) throw new Error("Redis unavailable");
  }
  async incrementWithExpiry(key: string) {
    this.assertUp();
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }
  resetPolls() {
    for (const k of [...this.counters.keys()]) {
      if (k.includes(":poll:")) this.counters.delete(k);
    }
  }
}

describe("CliAuthService — `ringee login`", () => {
  let repo: FakeCliAuthRepo;
  let redis: FakeRedis;
  let activeWorkspace: string | null;
  let service: CliAuthService;

  beforeEach(() => {
    repo = new FakeCliAuthRepo();
    redis = new FakeRedis();
    activeWorkspace = null;
    const organizations = {
      listMembershipsForUser: async () => [
        {
          id: ORG,
          name: "Acme",
          slug: "acme",
          imageUrl: null,
          role: "org:member",
        },
      ],
      // The active workspace lives in Redis.
      getActiveWorkspaceOrgId: async () => {
        redis.assertUp();
        return activeWorkspace;
      },
      setActiveWorkspace: async (_: string, orgId: string | null) => {
        redis.assertUp();
        activeWorkspace = orgId;
      },
    } as unknown as OrganizationService;
    const apiKeys = {
      mint: PersonalApiKeyService.prototype.mint,
      describeAccount: async (_: string, orgId: string | null) => ({
        user: { email: "agent@example.com", name: "Agent" },
        workspace: orgId
          ? { id: orgId, type: "organization", name: "Acme" }
          : { id: "personal", type: "personal", name: "Personal" },
      }),
    } as unknown as PersonalApiKeyService;
    service = new CliAuthService(
      repo as unknown as CliAuthRequestRepository,
      apiKeys,
      organizations,
      redis as unknown as RedisService,
    );
  });

  async function startAndPoll() {
    const started = await service.start({
      deviceName: "edison-mbp",
      platform: "darwin arm64",
      clientVersion: "0.3.0",
      ip: "203.0.113.7",
    });
    return started;
  }

  it("hands the terminal a secret device code and a confirmable user code", async () => {
    const started = await startAndPoll();
    assert.match(started.userCode, /^[A-Z]{4}-[A-Z]{4}$/);
    assert.ok(
      started.verificationUriComplete.endsWith(`?code=${started.userCode}`),
    );
    assert.equal(started.interval, 2);
    // Only the hash of the device code is stored.
    assert.notEqual(repo.rows[0].deviceCodeHash, started.deviceCode);
  });

  it("keeps the terminal waiting until the user decides", async () => {
    const started = await startAndPoll();
    assert.deepEqual(await service.poll(started.deviceCode), {
      status: "error",
      error: "authorization_pending",
    });
  });

  it("issues exactly one key after approval, in the chosen workspace", async () => {
    const started = await startAndPoll();
    await service.approve(USER, started.userCode.toLowerCase(), ORG);
    assert.equal(activeWorkspace, ORG);

    const first = await service.poll(started.deviceCode);
    assert.equal(first.status, "authorized");
    if (first.status !== "authorized") return;
    assert.match(first.apiKey, /^ringee_sk_[0-9a-f]{64}$/);
    assert.equal(first.workspace.id, ORG);
    assert.equal(repo.keys.length, 1);

    redis.resetPolls();
    assert.deepEqual(await service.poll(started.deviceCode), {
      status: "error",
      error: "expired_token",
    });
    assert.equal(repo.keys.length, 1);
  });

  it("tells the terminal when the user denied it", async () => {
    const started = await startAndPoll();
    await service.deny(USER, started.userCode);
    assert.deepEqual(await service.poll(started.deviceCode), {
      status: "error",
      error: "access_denied",
    });
    assert.equal(repo.keys.length, 0);
  });

  it("refuses a workspace the user does not belong to", async () => {
    const started = await startAndPoll();
    await assert.rejects(
      service.approve(
        USER,
        started.userCode,
        "33333333-3333-4333-8333-333333333333",
      ),
      /not a member/,
    );
    assert.equal(repo.rows[0].status, "pending");
  });

  it("cannot approve twice or after expiry", async () => {
    const started = await startAndPoll();
    await service.approve(USER, started.userCode, "personal");
    await assert.rejects(
      service.approve(USER, started.userCode, "personal"),
      /expired or was already used/,
    );

    const late = await startAndPoll();
    repo.rows[1].expiresAt = new Date(Date.now() - 1000);
    await assert.rejects(
      service.approve(USER, late.userCode, "personal"),
      /expired or was already used/,
    );
    assert.deepEqual(await service.poll(late.deviceCode), {
      status: "error",
      error: "expired_token",
    });
  });

  it("records no approval when the workspace could not be set", async () => {
    const started = await startAndPoll();
    redis.down = true;
    await assert.rejects(
      service.approve(USER, started.userCode, ORG),
      /Redis unavailable/,
    );
    assert.equal(repo.rows[0].status, "pending");
    assert.deepEqual(await service.poll(started.deviceCode), {
      status: "error",
      error: "authorization_pending",
    });

    redis.down = false;
    await service.approve(USER, started.userCode, ORG);
    assert.equal(activeWorkspace, ORG);
  });

  it("does not burn an approved code when collecting fails", async () => {
    const started = await startAndPoll();
    await service.approve(USER, started.userCode, ORG);

    redis.down = true;
    await assert.rejects(service.poll(started.deviceCode), /Redis unavailable/);
    assert.equal(repo.rows[0].status, "approved");
    assert.equal(repo.keys.length, 0);

    // The CLI retries a 5xx; the next poll collects the key.
    redis.down = false;
    const collected = await service.poll(started.deviceCode);
    assert.equal(collected.status, "authorized");
    assert.equal(repo.keys.length, 1);
  });

  it("asks a terminal that polls too fast to slow down", async () => {
    const started = await startAndPoll();
    await service.poll(started.deviceCode);
    await service.poll(started.deviceCode);
    assert.deepEqual(await service.poll(started.deviceCode), {
      status: "error",
      error: "slow_down",
    });
  });

  it("rate limits logins that arrive without an IP", async () => {
    for (let i = 0; i < 20; i++) await service.start({ ip: null });
    await assert.rejects(service.start({ ip: null }), /Too many login/);
  });

  it("treats an unknown device code as expired", async () => {
    assert.deepEqual(await service.poll("not-a-real-code"), {
      status: "error",
      error: "expired_token",
    });
  });
});

describe("PersonalApiKeyService.mint", () => {
  const service = Object.create(
    PersonalApiKeyService.prototype,
  ) as PersonalApiKeyService;
  const uniqueViolation = (target: string[]) =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target },
    });

  it("draws a new key when the display prefix is taken", async () => {
    const prefixes: string[] = [];
    const { generated, result } = await service.mint(async (key) => {
      prefixes.push(key.prefix);
      if (prefixes.length === 1) throw uniqueViolation(["prefix"]);
      return "stored";
    });
    assert.equal(result, "stored");
    assert.equal(prefixes.length, 2);
    assert.equal(generated.prefix, prefixes[1]);
  });

  it("does not swallow other unique violations", async () => {
    let calls = 0;
    await assert.rejects(
      service.mint(async () => {
        calls++;
        throw uniqueViolation(["userCode"]);
      }),
      /Unique constraint/,
    );
    assert.equal(calls, 1);
  });

  it("gives up after a few collisions", async () => {
    let calls = 0;
    await assert.rejects(
      service.mint(async () => {
        calls++;
        throw uniqueViolation(["prefix"]);
      }),
    );
    assert.equal(calls, 3);
  });
});

describe("McpUsageService.pruneExpired", () => {
  it("deletes year-old events in bounded batches until none are left", async () => {
    const counts = [5_000, 5_000, 12];
    const cutoffs: Date[] = [];
    const repo = {
      deleteOlderThan: async (cutoff: Date) => {
        cutoffs.push(cutoff);
        return counts.shift() ?? 0;
      },
    };
    const usage = new McpUsageService(repo as never, {} as never, {} as never);
    const now = new Date("2026-10-01T00:00:00Z");

    assert.equal(await usage.pruneExpired(now), 10_012);
    assert.equal(cutoffs.length, 3);
    assert.equal(cutoffs[0].toISOString(), "2025-10-01T00:00:00.000Z");
  });
});

describe("McpUsageService.surfaceOf", () => {
  it("counts the ringee CLI as the CLI surface", () => {
    assert.equal(
      McpUsageService.surfaceOf(
        { name: "ringee-cli", version: "0.3.0" },
        { authMethod: "api_key" },
      ),
      "cli",
    );
  });

  it("counts the pre-0.3 CLI only on legacy URLs", () => {
    const client = { name: "ringee-agent", version: "0.1.0" };
    assert.equal(
      McpUsageService.surfaceOf(client, { authMethod: "url" }),
      "cli",
    );
    // Over OAuth the same name is the ChatGPT app proxy.
    assert.equal(
      McpUsageService.surfaceOf(client, { authMethod: "oauth" }),
      "mcp",
    );
  });

  it("falls back to the key's origin when the client is unknown", () => {
    assert.equal(
      McpUsageService.surfaceOf(null, {
        authMethod: "api_key",
        apiKeySource: "cli",
      }),
      "cli",
    );
    assert.equal(
      McpUsageService.surfaceOf(
        { name: "claude-code", version: "2.1.0" },
        { authMethod: "api_key", apiKeySource: "cli" },
      ),
      "mcp",
    );
  });
});
