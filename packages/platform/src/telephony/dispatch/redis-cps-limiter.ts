import { createHash } from "node:crypto";
import type { RedisService } from "../../redis/redis.service";
import { CPS_ACQUIRE_LUA, CPS_RECENT_LUA, CPS_RECORD_LUA } from "./cps-scripts";
import type { BlockedBy } from "./gcra";
import { accountSlot, type ProviderAccountRef } from "./provider-account";
import type { TrafficLevel } from "./traffic-class";

/** The slice of `RedisService` the limiter needs; a test can stand in for it. */
export type LimiterRedis = Pick<RedisService, "runScript" | "hashGetAll">;

export type AcquireMode = "acquire" | "peek" | "force" | "observe";

export interface AcquireInput {
  /**
   * Which family of clocks decides. `egress` is the account's one budget of
   * call starts: every start spends it, whether this server sends it through
   * the Telnyx client or a client dials it right after its grant
   * (`directStart`), so neither can use capacity the other already took. The
   * `admission` clocks only schedule server work ahead of its egress; a second
   * gate at egress also keeps delayed permits from bunching up.
   */
  phase?: "admission" | "egress";
  account: ProviderAccountRef;
  level: TrafficLevel;
  mode: AcquireMode;
  levelIntervalsMicros: readonly [number, number, number, number];
  /** The workspace whose automated-start clock applies, or `null` for none. */
  workspaceKey: string | null;
  workspaceIntervalMicros: number;
  /** Time automation leaves the level-0 clock free for a person, microseconds. */
  automationGuardMicros: number;
  /** The furthest an overage may push a clock past now, microseconds. */
  overageHorizonMicros: number;
  /**
   * A retry of the same provider command must not spend a second grant: while
   * this marker lives, the same reference is granted without moving a clock.
   */
  idempotencyRef?: string | null;
  idempotencyTtlSeconds?: number;
  /** Count the attempt in the per-second and per-hour statistics. */
  countAttempt: boolean;
}

export interface AcquireResult {
  granted: boolean;
  retryAfterMicros: number;
  /** Redis's clock when the decision was made. */
  nowMicros: number;
  blockedBy: BlockedBy | null;
  /** The reference had already been granted; nothing was spent. */
  reused: boolean;
  /** `observe` mode: enforcement would have deferred this attempt. */
  wouldDefer: boolean;
  /** `force` mode: granted although a clock was busy. */
  overage: boolean;
}

const SECOND_COUNTER_TTL_SECONDS = 2 * 3600;
/** Three days: a rollup outage shorter than that loses nothing. */
const HOUR_HASH_TTL_SECONDS = 3 * 24 * 3600;
const WORKSPACE_CLOCK_EXTRA_TTL_MS = 5 * 60_000;
const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 120;

const BLOCKED_BY: Record<number, BlockedBy> = {
  0: "level0",
  1: "level1",
  2: "level2",
  3: "level3",
  10: "workspace",
};

/** A Redis key segment from an id: no braces (they are hash tags), no spaces. */
function segment(value: string): string {
  const cleaned = value.replace(/[{}\s]/g, "_");
  return cleaned.length <= 96
    ? cleaned
    : createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export class RedisCpsLimiter {
  constructor(private readonly redis: LimiterRedis) {}

  /** The keys of one provider account's budget. They share one hash tag. */
  static keys(account: ProviderAccountRef) {
    const tag = `cps:{${accountSlot(account)}}`;
    return {
      level: (level: number) => `${tag}:l${level}`,
      workspace: (workspaceKey: string) => `${tag}:ws:${segment(workspaceKey)}`,
      idempotency: (ref: string) => `${tag}:idem:${segment(ref)}`,
      secondPrefix: `${tag}:sec:`,
      hourPrefix: `${tag}:hour:`,
      /** The hour any instant falls in, keyed by its first second (as the script does). */
      hour: (instantMs: number) =>
        `${tag}:hour:${Math.floor(instantMs / 3_600_000) * 3_600}`,
    };
  }

  async acquire(input: AcquireInput): Promise<AcquireResult> {
    const keys = RedisCpsLimiter.keys(input.account);
    const clockKey = (level: number) =>
      input.phase === "egress"
        ? `${keys.level(level)}:egress`
        : keys.level(level);
    const idempotencyTtl = input.idempotencyRef
      ? (input.idempotencyTtlSeconds ?? DEFAULT_IDEMPOTENCY_TTL_SECONDS)
      : 0;
    const reply = await this.redis.runScript(
      CPS_ACQUIRE_LUA,
      [
        clockKey(0),
        clockKey(1),
        clockKey(2),
        clockKey(3),
        input.workspaceKey
          ? `${keys.workspace(input.workspaceKey)}${input.phase === "egress" ? ":egress" : ""}`
          : keys.workspace("none"),
        keys.idempotency(input.idempotencyRef ?? "none"),
      ],
      [
        input.level,
        input.mode,
        input.levelIntervalsMicros[0],
        input.levelIntervalsMicros[1],
        input.levelIntervalsMicros[2],
        input.levelIntervalsMicros[3],
        input.workspaceKey ? input.workspaceIntervalMicros : 0,
        WORKSPACE_CLOCK_EXTRA_TTL_MS,
        input.countAttempt ? "1" : "0",
        idempotencyTtl,
        keys.secondPrefix,
        keys.hourPrefix,
        SECOND_COUNTER_TTL_SECONDS,
        HOUR_HASH_TTL_SECONDS,
        input.automationGuardMicros,
        input.overageHorizonMicros,
        // State loss or a fresh account waits a full rolling second before
        // sending. A Redis restart cannot reset the budget into a burst.
        input.phase === "egress" ? 1_000_000 : 0,
      ],
    );
    return parseAcquireReply(reply);
  }

  /**
   * Adds to the current hour's counters. With `countAttempt` the attempt is also
   * counted in the current second (and so in the hourly peak): that is how a
   * browser leg Ringee only learns of from its webhook enters the figures.
   * Returns `false` when `dedupeRef` had already been recorded.
   */
  async record(
    account: ProviderAccountRef,
    events: Record<string, number>,
    options: {
      countAttempt?: boolean;
      dedupeRef?: string;
      dedupeTtlSeconds?: number;
    } = {},
  ): Promise<boolean> {
    const keys = RedisCpsLimiter.keys(account);
    const pairs: Array<string | number> = [];
    for (const [field, amount] of Object.entries(events)) {
      if (!/^[a-z0-9_]{1,40}$/.test(field)) {
        throw new RangeError(`Invalid statistics field "${field}"`);
      }
      if (Number.isFinite(amount) && amount !== 0) pairs.push(field, amount);
    }
    const reply = await this.redis.runScript(
      CPS_RECORD_LUA,
      [keys.idempotency(options.dedupeRef ?? "none")],
      [
        keys.hourPrefix,
        HOUR_HASH_TTL_SECONDS,
        options.countAttempt ? "1" : "0",
        keys.secondPrefix,
        SECOND_COUNTER_TTL_SECONDS,
        options.dedupeRef ? (options.dedupeTtlSeconds ?? 7200) : 0,
        ...pairs,
      ],
    );
    return Number(reply) === 1;
  }

  /** One hour's counters as the limiter wrote them; empty when none exist. */
  async readHour(
    account: ProviderAccountRef,
    hourStartMs: number,
  ): Promise<Record<string, number>> {
    const raw = await this.redis.hashGetAll<unknown>(
      RedisCpsLimiter.keys(account).hour(hourStartMs),
    );
    const counters: Record<string, number> = {};
    for (const [field, value] of Object.entries(raw)) {
      const number = Number(value);
      if (Number.isFinite(number)) counters[field] = number;
    }
    return counters;
  }

  /** Counted attempts per second for the last `seconds` seconds, oldest first. */
  async recentSeconds(
    account: ProviderAccountRef,
    seconds: number,
  ): Promise<{ endSecond: number; counts: number[] }> {
    const reply = await this.redis.runScript(
      CPS_RECENT_LUA,
      [],
      [RedisCpsLimiter.keys(account).secondPrefix, seconds],
    );
    if (!Array.isArray(reply) || reply.length < 1) {
      throw new Error("Unexpected reply from the pacing script");
    }
    const [endSecond, ...counts] = reply.map((value) => Number(value));
    return { endSecond, counts };
  }
}

export function parseAcquireReply(reply: unknown): AcquireResult {
  if (!Array.isArray(reply) || reply.length < 6) {
    throw new Error("Unexpected reply from the pacing script");
  }
  const [granted, retry, now, blocked, reused, wouldDefer, overage] =
    reply.map(Number);
  return {
    granted: granted === 1,
    retryAfterMicros: retry,
    nowMicros: now,
    blockedBy: BLOCKED_BY[blocked] ?? null,
    reused: reused === 1,
    wouldDefer: wouldDefer === 1,
    overage: overage === 1,
  };
}
