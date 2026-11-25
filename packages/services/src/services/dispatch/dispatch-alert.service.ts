import { createHash } from "node:crypto";
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { AiVoiceAgentCallDispatchRepository } from "@ringee/database";
import {
  DispatchRuntime,
  EMAIL_PROVIDER,
  ProviderDispatchService,
  RedisService,
  TRAFFIC_CLASSES,
  TRAFFIC_LABEL,
  type DispatchAlert,
  type EmailInterface,
} from "@ringee/platform";
import { DispatchStatsService } from "./dispatch-stats.service";

/** A pacing mode that is not `enforce` costs money once Telnyx starts billing. */
const BILLING_STARTS_AT = Date.parse("2026-12-01T00:00:00Z");
/** A call waiting longer than this, per traffic level, is a queue in trouble. */
const WAIT_ALERT_SECONDS: Record<number, number> = { 1: 120, 2: 300, 3: 900 };
const QUEUE_SATURATION_RATIO = 0.8;
/** An alert's email is sent once an hour however often it is raised. */
const EMAIL_COOLDOWN_SECONDS = 3600;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Tells a person when the CPS protection needs them (CPS-011): in the logs
 * (`[cps-alert]`, which CloudWatch can alarm on) and by email to the team, once
 * an hour per condition across every process.
 *
 * It watches for the conditions the brief names — sustained CPS near the limit,
 * the estimated surcharge over budget, a queue waiting too long, an interactive
 * call that had to wait, the provider rejecting for rate, coordination down,
 * an outbound path that skipped the limiter — and for two that only matter
 * once Telnyx starts billing: pacing still in shadow mode, and calls whose
 * dispatch was committed and never answered.
 */
@Injectable()
export class DispatchAlertService implements OnModuleInit {
  private readonly logger = new Logger(DispatchAlertService.name);
  private readonly emailed = new Map<string, number>();

  constructor(
    private readonly dispatch: ProviderDispatchService,
    private readonly runtime: DispatchRuntime,
    private readonly stats: DispatchStatsService,
    private readonly dispatches: AiVoiceAgentCallDispatchRepository,
    private readonly redis: RedisService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailInterface,
  ) {}

  onModuleInit(): void {
    // Whatever the platform layer raises (Redis down, a bypass) is emailed too.
    this.runtime.setAlertSink((alert) => this.deliver(alert));
  }

  /** Emails an alert to the team, once per cooldown across every process. */
  async deliver(alert: DispatchAlert): Promise<void> {
    const to = apiConfiguration.RINGEE_TEAM_EMAIL;
    if (!to) return;
    const key = createHash("sha256")
      .update(alert.key)
      .digest("hex")
      .slice(0, 24);
    let fresh = true;
    try {
      fresh = await this.redis.setIfAbsent(
        `ringee:dispatch:alert:${key}`,
        "1",
        EMAIL_COOLDOWN_SECONDS,
      );
    } catch {
      // Redis may be the very thing that is down: do not stay silent about it.
      const last = this.emailed.get(alert.key) ?? 0;
      fresh = Date.now() - last > EMAIL_COOLDOWN_SECONDS * 1000;
      if (fresh) this.emailed.set(alert.key, Date.now());
    }
    if (!fresh) return;

    const rows = Object.entries(alert.detail)
      .map(
        ([name, value]) =>
          `<tr><td style="padding:2px 12px 2px 0"><b>${escapeHtml(name)}</b></td><td>${escapeHtml(
            typeof value === "string" ? value : JSON.stringify(value),
          )}</td></tr>`,
      )
      .join("");
    const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2 style="margin:0 0 8px">${escapeHtml(alert.title)}</h2>
      <p style="margin:0 0 12px;color:#555">${alert.severity.toUpperCase()} · ${escapeHtml(alert.key)}</p>
      <table style="font-size:14px">${rows}</table>
      <p style="margin-top:16px;color:#777;font-size:13px">Telnyx outbound CPS protection. See docs/telnyx-cps-cost-protection.md and the backoffice dispatch controls.</p>
    </div>`;
    await this.email
      .sendEmail(
        to,
        `[Ringee] CPS ${alert.severity}: ${alert.title}`,
        html,
        "Ringee Notifications",
        apiConfiguration.EMAIL_FROM_ADDRESS,
      )
      .catch((error: Error) =>
        this.logger.warn(
          `Could not email the alert ${alert.key}: ${error.message}`,
        ),
      );
  }

  /**
   * Looks at the numbers and raises what needs a person. Each condition has a
   * stable key, so a persisting one is reported once per cooldown, not once per
   * minute.
   */
  async evaluate(nowMs = Date.now()): Promise<DispatchAlert[]> {
    const raised: DispatchAlert[] = [];
    const raise = (alert: DispatchAlert) => {
      raised.push(alert);
      this.dispatch.raise(alert);
    };
    const state = await this.dispatch.state();
    const { settings, limits } = state;

    // 1. How close to the CPS Telnyx bills above.
    try {
      const { counts } = await this.dispatch.recentSeconds(300);
      const max = counts.length ? Math.max(...counts) : 0;
      if (max > settings.ceilingCps) {
        raise({
          key: "cps_above_ceiling",
          severity: "critical",
          title: `Outbound reached ${max} CPS, above the free ${settings.ceilingCps}`,
          detail: {
            maxPerSecondLast5Min: max,
            ceiling: settings.ceilingCps,
            effective: limits.effectiveCps,
          },
        });
      } else if (max >= Math.ceil(0.9 * settings.ceilingCps)) {
        raise({
          key: "cps_near_ceiling",
          severity: "warning",
          title: `Outbound reached ${max} of ${settings.ceilingCps} free CPS`,
          detail: {
            maxPerSecondLast5Min: max,
            ceiling: settings.ceilingCps,
            effective: limits.effectiveCps,
          },
        });
      }
    } catch {
      // Redis is down: the platform layer raises that on its own.
    }

    // 2. The estimated bill.
    try {
      const date = new Date(nowMs);
      const month = await this.stats.estimateMonth(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        nowMs,
      );
      const upper = month.estimate.surchargeUpper.totalUsd;
      if (upper > settings.surchargeBudgetUsd) {
        raise({
          key: "surcharge_over_budget",
          severity: "critical",
          title: `Estimated Telnyx CPS surcharge $${upper.toLocaleString("en-US")} is over the $${settings.surchargeBudgetUsd.toLocaleString("en-US")} budget`,
          detail: {
            month: month.month,
            p95Cps: month.estimate.p95,
            estimatedUsd: month.estimate.surcharge.totalUsd,
            upperUsd: upper,
            activeHours: month.estimate.activeHours,
            hoursToClear: month.estimate.hoursToClear,
            basis: "Ringee's own dispatch measurement; not invoice-accurate",
          },
        });
      }
    } catch {
      // No estimate yet (the tables may not exist): nothing to compare.
    }

    // 3. The queue.
    try {
      const depth = await this.dispatches.depth(new Date(nowMs));
      const total = depth.reduce((sum, level) => sum + level.queued, 0);
      for (const level of depth) {
        const limit = WAIT_ALERT_SECONDS[level.level];
        const waited = level.oldestQueuedAt
          ? Math.round((nowMs - level.oldestQueuedAt.getTime()) / 1000)
          : 0;
        if (limit && waited > limit) {
          raise({
            key: `queue_wait_l${level.level}`,
            severity: "warning",
            title: `${TRAFFIC_LABEL[TRAFFIC_CLASSES[level.level]]} calls have waited ${Math.round(waited / 60)} min for capacity`,
            detail: {
              level: level.level,
              queued: level.queued,
              oldestWaitSeconds: waited,
              limitSeconds: limit,
            },
          });
        }
      }
      if (total >= settings.queueMaxTotal * QUEUE_SATURATION_RATIO) {
        raise({
          key: "queue_saturated",
          severity: "warning",
          title: `The call queue is ${Math.round((total / settings.queueMaxTotal) * 100)}% full`,
          detail: { queued: total, bound: settings.queueMaxTotal },
        });
      }
      const inDoubt = await this.dispatches.countAmbiguous(
        new Date(nowMs - 5 * 60_000),
      );
      if (inDoubt > 0) {
        raise({
          key: "dispatch_in_doubt",
          severity: "warning",
          title: `${inDoubt} queued call(s) were committed and never answered by the provider`,
          detail: {
            calls: inDoubt,
            note: "They are not redialed: a leg may be live.",
          },
        });
      }
    } catch {
      // The queue tables may not exist yet.
    }

    // 4. What this hour's counters say.
    const hours = [await this.safeHour(nowMs)];
    if (new Date(nowMs).getUTCMinutes() < 15)
      hours.push(await this.safeHour(nowMs - 3_600_000));
    const sum = (field: string) =>
      hours.reduce((total, hour) => total + (hour?.[field] ?? 0), 0);
    if (sum("rate_limited") > 0) {
      raise({
        key: "provider_rate_limited",
        severity: "critical",
        title: "Telnyx rejected outbound calls for rate",
        detail: {
          rejections: sum("rate_limited"),
          dpsRejections: sum("dps_rejected"),
        },
      });
    }
    if (sum("bypass") > 0) {
      raise({
        key: "path_bypassed_limiter",
        severity: "warning",
        title:
          "An outbound path started calls without declaring its traffic class",
        detail: {
          calls: sum("bypass"),
          fix: "Wrap the call site in inDispatchScope; see the log line [cps-alert] bypass for the path.",
        },
      });
    }
    const slow = sum("w_l0_1000");
    const overage = sum("overage");
    if (slow > 0 || overage > 0) {
      raise({
        key: "interactive_delayed",
        severity: "warning",
        title: "A person's call waited for outbound capacity",
        detail: { waitedOverASecond: slow, wentOutAsOverage: overage },
      });
    }

    // 5. The mode.
    if (settings.mode !== "enforce" && nowMs >= BILLING_STARTS_AT) {
      raise({
        key: "pacing_not_enforced",
        severity: settings.mode === "off" ? "critical" : "warning",
        title: `Outbound pacing is "${settings.mode}" while Telnyx bills CPS peaks`,
        detail: { mode: settings.mode, billingStarted: "2026-12-01" },
      });
    }
    return raised;
  }

  private async safeHour(
    instantMs: number,
  ): Promise<Record<string, number> | null> {
    try {
      return await this.dispatch.readHour(instantMs);
    } catch {
      return null;
    }
  }
}
