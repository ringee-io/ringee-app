import type { TrafficLevel } from "./traffic-class";

/**
 * Strict pacing by the generic cell rate algorithm with no burst tolerance
 * (CPS-004).
 *
 * Each clock keeps one number: the earliest moment (its "theoretical arrival
 * time", TAT) the next grant is allowed. A grant at `now` is legal when
 * `now >= TAT`, and moves the clock to `max(TAT, now) + interval`. Grants on
 * one clock are therefore always at least one interval apart: there is no
 * bucket to refill and no fixed window to straddle, so five calls cannot land
 * either side of a second boundary the way a per-second counter allows.
 *
 * This is the pure reference model used to verify the Redis script. Production
 * never uses this in-memory model as a distributed-coordination fallback.
 * Time is in microseconds throughout.
 */
export type BlockedBy = "level0" | "level1" | "level2" | "level3" | "workspace";

export interface PacingRequest {
  level: TrafficLevel;
  /** Spacing, in microseconds, of the clock of each traffic level. */
  levelIntervalsMicros: readonly [number, number, number, number];
  /** The workspace's automated-start clock; `null` for no workspace clock. */
  workspaceKey: string | null;
  workspaceIntervalMicros: number;
  /**
   * Automated levels (1-3) must leave the shared level-0 clock free for this
   * long before they may take it. A person retrying at the exact instant it
   * frees up therefore always wins the tie, instead of racing automation that
   * retries at the same instant: their wait is bounded by the grants ahead of
   * them, not by chance.
   */
  automationGuardMicros?: number;
  /**
   * The furthest `advance` (an overage) may push a clock beyond `now`. A flood
   * of interactive requests is never refused, but it must not be able to hold
   * the shared clock — and with it all automation — hours into the future.
   */
  overageHorizonMicros?: number;
}

export interface PacingDecision {
  granted: boolean;
  /** How long until the same request would be granted; 0 when granted. */
  retryAfterMicros: number;
  /** The clock that refused, when one did. */
  blockedBy: BlockedBy | null;
}

const BLOCKED_BY: readonly BlockedBy[] = [
  "level0",
  "level1",
  "level2",
  "level3",
];

/**
 * One account's clocks held in memory.
 *
 * A request at level L is checked against, and advances, the clocks of levels
 * 0..L: clock k bounds everything at level k or lower priority, so the
 * interactive level can never be crowded out by the others (see
 * `deriveLimits`). A request that carries a workspace key must also clear that
 * workspace's own clock, which only automated levels use.
 */
export class PacingClocks {
  private readonly levels: [number, number, number, number] = [0, 0, 0, 0];
  private readonly workspaces = new Map<string, number>();

  /** Looks at the clocks without moving them. */
  peek(request: PacingRequest, nowMicros: number): PacingDecision {
    let retry = 0;
    let blockedBy: BlockedBy | null = null;
    const guard = request.level >= 1 ? (request.automationGuardMicros ?? 0) : 0;
    for (let i = 0; i <= request.level; i++) {
      // The guard follows a grant; a clock nobody has taken has nothing to
      // leave free.
      const held = i === 0 && this.levels[0] > 0 ? guard : 0;
      const wait = this.levels[i] + held - nowMicros;
      if (wait > retry) {
        retry = wait;
        blockedBy = BLOCKED_BY[i];
      }
    }
    if (request.workspaceKey !== null) {
      const wait = (this.workspaces.get(request.workspaceKey) ?? 0) - nowMicros;
      if (wait > retry) {
        retry = wait;
        blockedBy = "workspace";
      }
    }
    return retry > 0
      ? { granted: false, retryAfterMicros: retry, blockedBy }
      : { granted: true, retryAfterMicros: 0, blockedBy: null };
  }

  /** Grants when every clock allows it, moving them; otherwise changes nothing. */
  acquire(request: PacingRequest, nowMicros: number): PacingDecision {
    const decision = this.peek(request, nowMicros);
    if (decision.granted) this.advance(request, nowMicros);
    return decision;
  }

  /** Moves the clocks as a grant would, whatever they say (an overage). */
  advance(request: PacingRequest, nowMicros: number): void {
    const horizon = request.overageHorizonMicros ?? 0;
    for (let i = 0; i <= request.level; i++) {
      const next =
        Math.max(this.levels[i], nowMicros) + request.levelIntervalsMicros[i];
      this.levels[i] = horizon > 0 ? Math.min(next, nowMicros + horizon) : next;
    }
    if (request.workspaceKey !== null) {
      const tat = this.workspaces.get(request.workspaceKey) ?? 0;
      this.workspaces.set(
        request.workspaceKey,
        Math.max(tat, nowMicros) + request.workspaceIntervalMicros,
      );
      if (this.workspaces.size > 10_000) this.prune(nowMicros);
    }
  }

  /** How many workspace clocks are remembered; bounded, see `advance`. */
  get trackedWorkspaces(): number {
    return this.workspaces.size;
  }

  private prune(nowMicros: number): void {
    for (const [key, tat] of this.workspaces) {
      if (tat <= nowMicros) this.workspaces.delete(key);
    }
  }
}
