import { Injectable, Logger } from "@nestjs/common";
import {
  AiVoiceAgentCallDispatchRepository,
  ProviderDispatchHourRepository,
} from "@ringee/database";
import {
  ProviderDispatchService,
  TRAFFIC_CLASSES,
  TRAFFIC_LABEL,
  accountSlot,
  estimateMonthlyCpsSurcharge,
  hourStartOf,
  monthRangeUtc,
  type CpsEstimate,
  type HourlyPeak,
} from "@ringee/platform";

const HOUR_MS = 3_600_000;
/** How far back the first flush looks; Redis keeps an hour's counters for 3 days. */
const FIRST_FLUSH_LOOKBACK_HOURS = 72;

/**
 * What the estimate is and is not. Printed beside every figure, because a
 * dollar amount without these would claim an accuracy it does not have.
 */
export const ESTIMATE_CAVEATS = [
  "Measured by Ringee's own dispatch, not by Telnyx. Telnyx counts accepted attempts from its CDRs; the two differ by network timing and by attempts Ringee cannot see.",
  "A call a browser or the mobile app places straight to Telnyx is counted when its webhook reaches Ringee, not when Telnyx received it.",
  "Hours are UTC calendar hours; Telnyx does not document its hour boundary.",
  "Telnyx does not publish its percentile definition. `p95` is nearest rank (it matches Telnyx's own 100-hour example); the upper figure prices the larger of nearest rank and linear interpolation.",
  "Rejected requests remain in local peaks, but missing SIP paths, callback timing and outages can make the estimate either higher or lower than Telnyx's bill.",
  'Not invoice-accurate until reconciled against Telnyx\'s invoice line "Outbound Calls-Per-Second Peak Usage Surcharge".',
] as const;

export interface MonthEstimate {
  month: string;
  basis: "ringee_dispatch_measurement";
  estimate: CpsEstimate;
  /** The five busiest hours, so the cause of a high figure can be found. */
  topHours: Array<{ hour: string; peakCps: number; attempts: number }>;
  coverage: {
    hoursWithData: number;
    firstHour: string | null;
    lastHour: string | null;
  };
  caveats: readonly string[];
}

export interface DispatchSnapshot {
  generatedAt: string;
  mode: string;
  account: string;
  live: {
    windowSeconds: number;
    maxPerSecond: number | null;
    averagePerSecond: number | null;
    /** The busiest second as a share of the ceiling Telnyx bills above. */
    utilizationOfCeiling: number | null;
  };
  thisHour: Record<string, number> | null;
  queue: {
    total: number;
    byClass: Array<{
      class: string;
      label: string;
      queued: number;
      oldestWaitSeconds: number | null;
    }>;
    busiestWorkspaces: Array<{ workspaceKey: string; queued: number }>;
    committedWithoutAnswer: number;
  };
  coordination: { breakerOpen: boolean; failures: number };
  processCounters: Record<string, number>;
  currentMonth: MonthEstimate | null;
}

function omit(
  counters: Record<string, number>,
  names: string[],
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counters).filter(([name]) => !names.includes(name)),
  );
}

@Injectable()
export class DispatchStatsService {
  private readonly logger = new Logger(DispatchStatsService.name);

  constructor(
    private readonly dispatch: ProviderDispatchService,
    private readonly hours: ProviderDispatchHourRepository,
    private readonly dispatches: AiVoiceAgentCallDispatchRepository,
  ) {}

  private accountKey(): string {
    return accountSlot(this.dispatch.getAccount());
  }

  /**
   * Copies the hours' counters from Redis into PostgreSQL. Redis keeps them for
   * three days; PostgreSQL keeps them for the month the estimate needs. Safe to
   * run any number of times, from any number of workers: a flush only raises.
   */
  async rollup(nowMs = Date.now()): Promise<{ flushed: number }> {
    const key = this.accountKey();
    const current = hourStartOf(nowMs);
    const latest = await this.hours.latest(key);
    const from = latest
      ? Math.max(
          latest.hourStart.getTime() - HOUR_MS,
          current - FIRST_FLUSH_LOOKBACK_HOURS * HOUR_MS,
        )
      : current - FIRST_FLUSH_LOOKBACK_HOURS * HOUR_MS;

    let flushed = 0;
    for (let hour = from; hour <= current; hour += HOUR_MS) {
      const counters = await this.dispatch.readHour(hour);
      if (Object.keys(counters).length === 0) continue;
      await this.hours.merge(key, new Date(hour), {
        peakCps: counters.peak ?? 0,
        attempts: counters.attempts ?? 0,
        counters: omit(counters, ["peak", "attempts"]),
      });
      flushed++;
    }
    return { flushed };
  }

  /**
   * The estimated surcharge of a UTC calendar month: the stored hours, plus the
   * hour in progress when it falls inside the month. Labeled as an estimate,
   * with what it cannot know.
   */
  async estimateMonth(
    year: number,
    month: number,
    nowMs = Date.now(),
  ): Promise<MonthEstimate> {
    const { startMs, endMs } = monthRangeUtc(year, month);
    const rows = await this.hours.listBetween(
      this.accountKey(),
      new Date(startMs),
      new Date(endMs),
    );
    const byHour = new Map<number, HourlyPeak>(
      rows.map((row) => [
        row.hourStart.getTime(),
        {
          hourStartMs: row.hourStart.getTime(),
          peakCps: row.peakCps,
          attempts: row.attempts,
        },
      ]),
    );

    // The hour in progress is newer than the last flush: read it live.
    const current = hourStartOf(nowMs);
    if (current >= startMs && current < endMs) {
      try {
        const counters = await this.dispatch.readHour(current);
        if (counters.attempts) {
          const stored = byHour.get(current);
          byHour.set(current, {
            hourStartMs: current,
            peakCps: Math.max(stored?.peakCps ?? 0, counters.peak ?? 0),
            attempts: Math.max(stored?.attempts ?? 0, counters.attempts),
          });
        }
      } catch (error) {
        this.logger.debug(
          `The hour in progress could not be read for the estimate: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const peaks = [...byHour.values()].sort(
      (a, b) => a.hourStartMs - b.hourStartMs,
    );
    const estimate = estimateMonthlyCpsSurcharge(peaks, { asOf: startMs });
    const active = peaks.filter((peak) => peak.attempts > 0);
    return {
      month: `${year}-${String(month).padStart(2, "0")}`,
      basis: "ringee_dispatch_measurement",
      estimate,
      topHours: [...active]
        .sort((a, b) => b.peakCps - a.peakCps || b.attempts - a.attempts)
        .slice(0, 5)
        .map((peak) => ({
          hour: new Date(peak.hourStartMs).toISOString(),
          peakCps: peak.peakCps,
          attempts: peak.attempts,
        })),
      coverage: {
        hoursWithData: active.length,
        firstHour: active.length
          ? new Date(active[0].hourStartMs).toISOString()
          : null,
        lastHour: active.length
          ? new Date(active[active.length - 1].hourStartMs).toISOString()
          : null,
      },
      caveats: ESTIMATE_CAVEATS,
    };
  }

  /** What is happening now, for the backoffice. Never throws for a gap. */
  async snapshot(nowMs = Date.now()): Promise<DispatchSnapshot> {
    const state = await this.dispatch.state();
    const now = new Date(nowMs);

    let live: DispatchSnapshot["live"] = {
      windowSeconds: 60,
      maxPerSecond: null,
      averagePerSecond: null,
      utilizationOfCeiling: null,
    };
    try {
      const { counts } = await this.dispatch.recentSeconds(60);
      const max = counts.length ? Math.max(...counts) : 0;
      live = {
        windowSeconds: 60,
        maxPerSecond: max,
        averagePerSecond: counts.length
          ? Math.round(
              (counts.reduce((a, b) => a + b, 0) / counts.length) * 100,
            ) / 100
          : 0,
        utilizationOfCeiling:
          Math.round((max / state.settings.ceilingCps) * 100) / 100,
      };
    } catch {
      // Redis is not reachable: the gap is reported, not hidden.
    }

    let thisHour: Record<string, number> | null = null;
    try {
      thisHour = await this.dispatch.readHour(nowMs);
    } catch {
      thisHour = null;
    }

    const [depth, busiest, committedWithoutAnswer] = await Promise.all([
      this.dispatches.depth(now).catch(() => []),
      this.dispatches.busiestWorkspaces().catch(() => []),
      this.dispatches
        .countAmbiguous(new Date(nowMs - 5 * 60_000))
        .catch(() => 0),
    ]);

    const date = new Date(nowMs);
    const currentMonth = await this.estimateMonth(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      nowMs,
    ).catch(() => null);

    return {
      generatedAt: now.toISOString(),
      mode: state.settings.mode,
      account: accountSlot(state.account),
      live,
      thisHour,
      queue: {
        total: depth.reduce((sum, level) => sum + level.queued, 0),
        byClass: depth.map((level) => {
          const cls = TRAFFIC_CLASSES[level.level];
          return {
            class: cls,
            label: TRAFFIC_LABEL[cls],
            queued: level.queued,
            oldestWaitSeconds: level.oldestQueuedAt
              ? Math.max(
                  0,
                  Math.round((nowMs - level.oldestQueuedAt.getTime()) / 1000),
                )
              : null,
          };
        }),
        busiestWorkspaces: busiest,
        committedWithoutAnswer,
      },
      coordination: {
        breakerOpen: state.breaker.open,
        failures: state.breaker.failures,
      },
      processCounters: state.counters,
      currentMonth,
    };
  }
}
