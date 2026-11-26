import { CPS_ACQUIRE_LUA, CPS_RECENT_LUA, CPS_RECORD_LUA } from "./cps-scripts";
import { PacingClocks } from "./gcra";
import type { TrafficLevel } from "./traffic-class";

/**
 * A stand-in for Redis that understands the three pacing scripts, for tests
 * that exercise POLICY (what a class does when the clock is busy, when Redis is
 * down) without a server and without waiting in real time.
 *
 * It is driven by the same `PacingClocks` model the real script is proven equal
 * to in `pacing.redis.test.ts`, and by a clock the test advances. It is test
 * support, not production code.
 */
export class FakeDispatchRedis {
  /** The shared clock, in milliseconds. `sleep` advances it. */
  nowMs = 1_800_000_000_000;
  /** Make every call fail, or take too long. */
  failure: "none" | "error" | "hang" = "none";
  readonly clocks = new Map<string, PacingClocks>();
  readonly idempotency = new Map<string, number>();
  readonly hours = new Map<string, Record<string, number>>();
  readonly seconds = new Map<string, number>();
  readonly dedupe = new Set<string>();
  calls = 0;

  get nowMicros(): number {
    return this.nowMs * 1000;
  }

  /** What a test passes as the service's `sleep`. */
  sleep = async (ms: number): Promise<void> => {
    this.nowMs += ms;
  };

  async runScript(
    script: string,
    keys: string[],
    args: Array<string | number>,
  ): Promise<unknown> {
    this.calls++;
    if (this.failure === "error") throw new Error("ECONNREFUSED");
    if (this.failure === "hang") return new Promise(() => undefined);
    const a = args.map(String);
    if (script === CPS_ACQUIRE_LUA) return this.acquire(keys, a);
    if (script === CPS_RECORD_LUA) return this.record(keys, a);
    if (script === CPS_RECENT_LUA) return this.recent(a);
    throw new Error("Unknown script");
  }

  async hashGetAll<T>(key: string): Promise<Record<string, T>> {
    return (this.hours.get(key) ?? {}) as Record<string, T>;
  }

  /** The counters of the hour the fake clock is in (a test uses one account). */
  hourCounters(): Record<string, number> {
    const hourStart = Math.floor(Math.floor(this.nowMs / 1000) / 3600) * 3600;
    for (const [key, value] of this.hours) {
      if (key.endsWith(`:hour:${hourStart}`)) return value;
    }
    return {};
  }

  private clocksFor(key: string): PacingClocks {
    const tag = key.replace(/:l0(?=:|$)/, "");
    let clocks = this.clocks.get(tag);
    if (!clocks) {
      clocks = new PacingClocks();
      this.clocks.set(tag, clocks);
    }
    return clocks;
  }

  private acquire(keys: string[], a: string[]): number[] {
    const now = this.nowMicros;
    const level = Number(a[0]) as TrafficLevel;
    const mode = a[1];
    const intervals: [number, number, number, number] = [
      Number(a[2]),
      Number(a[3]),
      Number(a[4]),
      Number(a[5]),
    ];
    const workspaceInterval = Number(a[6]);
    const count = a[8] === "1";
    const idemTtl = Number(a[9]);
    const secPrefix = a[10];
    const hourPrefix = a[11];
    const guard = Number(a[14]);
    const horizon = Number(a[15]);
    const clocks = this.clocksFor(keys[0]);
    const recovery = Number(a[16] ?? 0);
    const recoveryKey = `${keys[0]}:initialized`;
    if (
      recovery > 0 &&
      mode === "acquire" &&
      !this.idempotency.has(recoveryKey)
    ) {
      this.idempotency.set(recoveryKey, Number.POSITIVE_INFINITY);
      clocks.advance(
        {
          level: 0,
          levelIntervalsMicros: [recovery, recovery, recovery, recovery],
          workspaceKey: null,
          workspaceIntervalMicros: 0,
        },
        now,
      );
      return [0, recovery, now, 0, 0, 0, 0];
    }
    const workspaceKey = workspaceInterval > 0 ? keys[4] : null;
    const request = {
      level,
      levelIntervalsMicros: intervals,
      workspaceKey,
      workspaceIntervalMicros: workspaceInterval,
      automationGuardMicros: guard,
      overageHorizonMicros: mode === "force" ? horizon : 0,
    };

    const idemKey = keys[5];
    if (idemTtl > 0) {
      const until = this.idempotency.get(idemKey);
      if (until !== undefined && until > this.nowMs)
        return [1, 0, now, -1, 1, 0, 0];
    }

    const peek = clocks.peek(request, now);
    const blocked = peek.blockedBy
      ? peek.blockedBy === "workspace"
        ? 10
        : Number(peek.blockedBy.replace("level", ""))
      : -1;
    if (mode === "peek") {
      return [
        peek.granted ? 1 : 0,
        peek.retryAfterMicros,
        now,
        blocked,
        0,
        0,
        0,
      ];
    }
    let wouldDefer = 0;
    let overage = 0;
    if (!peek.granted) {
      if (mode === "acquire")
        return [0, peek.retryAfterMicros, now, blocked, 0, 0, 0];
      if (mode === "observe") wouldDefer = 1;
      if (mode === "force") overage = 1;
    }
    if (wouldDefer === 0) clocks.advance(request, now);
    if (idemTtl > 0) this.idempotency.set(idemKey, this.nowMs + idemTtl * 1000);
    if (count) {
      const sec = Math.floor(now / 1_000_000);
      const secKey = `${secPrefix}${sec}`;
      const total = (this.seconds.get(secKey) ?? 0) + 1;
      this.seconds.set(secKey, total);
      const hourKey = `${hourPrefix}${Math.floor(sec / 3600) * 3600}`;
      const hour = this.hours.get(hourKey) ?? {};
      hour.peak = Math.max(hour.peak ?? 0, total);
      hour.attempts = (hour.attempts ?? 0) + 1;
      hour[`l${level}`] = (hour[`l${level}`] ?? 0) + 1;
      if (overage) hour.overage = (hour.overage ?? 0) + 1;
      if (wouldDefer)
        hour[`would_defer_l${level}`] =
          (hour[`would_defer_l${level}`] ?? 0) + 1;
      this.hours.set(hourKey, hour);
    }
    return [1, 0, now, -1, 0, wouldDefer, overage];
  }

  private record(keys: string[], a: string[]): number {
    const dedupeTtl = Number(a[5]);
    if (dedupeTtl > 0) {
      if (this.dedupe.has(keys[0])) return 0;
      this.dedupe.add(keys[0]);
    }
    const sec = Math.floor(this.nowMs / 1000);
    const hourKey = `${a[0]}${Math.floor(sec / 3600) * 3600}`;
    const hour = this.hours.get(hourKey) ?? {};
    if (a[2] === "1") {
      const secKey = `${a[3]}${sec}`;
      const total = (this.seconds.get(secKey) ?? 0) + 1;
      this.seconds.set(secKey, total);
      hour.peak = Math.max(hour.peak ?? 0, total);
      hour.attempts = (hour.attempts ?? 0) + 1;
    }
    for (let i = 6; i < a.length; i += 2) {
      hour[a[i]] = (hour[a[i]] ?? 0) + Number(a[i + 1]);
    }
    this.hours.set(hourKey, hour);
    return 1;
  }

  private recent(a: string[]): number[] {
    const nowSec = Math.floor(this.nowMs / 1000);
    const n = Number(a[1]);
    const out = [nowSec];
    for (let i = n - 1; i >= 0; i--)
      out.push(this.seconds.get(`${a[0]}${nowSec - i}`) ?? 0);
    return out;
  }
}
