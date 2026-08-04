import { Command } from "commander";
import type {
  AnalyticsBlock,
  CallOutcome,
  CallAnalyticsKpis,
} from "@ringee-io/agent";
import { getClient, run } from "../client.js";
import { c, heading, json, kv, line, wantsJson, warn } from "../ui.js";
import { printCallback } from "./activity.js";

const RANGES = ["today", "yesterday", "7d", "30d", "this_month", "last_month"];

const BLOCKS: AnalyticsBlock[] = [
  "kpis",
  "funnel",
  "by-outcome",
  "over-time",
  "best-time-of-day",
  "agents",
];

function printKpis(kpis: CallAnalyticsKpis): void {
  heading("KPIs");
  kv("window", `${kpis.rangeStart} → ${kpis.rangeEnd}`);
  kv("calls", kpis.totalCalls);
  kv("answered", `${kpis.answeredCalls} (${kpis.answerRate}%)`);
  kv("meetings", kpis.meetingsBooked);
  kv("sales", `${kpis.sales} (${kpis.conversionRate}%)`);
  kv("interested", kpis.interested);
  kv("follow-ups", kpis.followUps);
  kv("callbacks", kpis.callbacksScheduled);
  kv("not interested", kpis.notInterested);
  kv("no answer", kpis.noAnswer);
  kv("voicemail", kpis.voicemail);
  kv("positive rate", `${kpis.positiveOutcomeRate}%`);
  kv("avg duration", `${Math.round(kpis.averageDuration)}s`);
}

export function registerAnalytics(program: Command): void {
  const analytics = program
    .command("analytics")
    .description("Read call analytics — the dashboard overview numbers");

  analytics
    .command("calls")
    .description("Dashboard overview: volume, answer rate, outcomes, funnel")
    .option("-r, --range <range>", `preset window (${RANGES.join(", ")})`)
    .option("--from <iso>", "custom window start (ISO-8601 with offset)")
    .option("--to <iso>", "custom window end (ISO-8601 with offset)")
    .option(
      "--campaign <campaignId|none>",
      "restrict to a campaign, or 'none' for calls outside any campaign",
    )
    .option("--outcome <outcome>", "restrict every metric to this outcome")
    .option("--scope <scope>", "'personal' or 'organization'")
    .option("--member <userId>", "narrow to one member (org admins only)")
    .option(
      "--include <blocks...>",
      `blocks to compute (${BLOCKS.join(", ")}); default kpis funnel by-outcome`,
    )
    .action((opts) =>
      run(async () => {
        const res = await getClient().getCallAnalytics({
          range: opts.range,
          from: opts.from,
          to: opts.to,
          campaignId: opts.campaign,
          outcome: opts.outcome as CallOutcome | undefined,
          scope: opts.scope,
          memberUserId: opts.member,
          include: opts.include as AnalyticsBlock[] | undefined,
        });
        if (wantsJson()) return json(res);

        const label =
          res.campaignId === "none"
            ? "calls outside any campaign"
            : res.campaignId
              ? `campaign ${res.campaignId}`
              : "all calls";
        line(c.dim(`${res.scope} scope · ${label}`));

        if (res.kpis) printKpis(res.kpis);

        if (res.funnel) {
          heading("Funnel");
          res.funnel.forEach((step) => kv(step.label, step.value));
        }

        if (res.callsByOutcome) {
          heading("By outcome");
          res.callsByOutcome.forEach((row) => kv(row.outcome, row.count));
        }

        // The remaining blocks are chart series — dump them raw.
        if (res.outcomesOverTime) {
          heading("Over time");
          json(res.outcomesOverTime);
        }
        if (res.bestTimeOfDay) {
          heading("Best time of day");
          json(res.bestTimeOfDay);
        }
        if (res.agents) {
          heading("Agents");
          json(res.agents);
        }
      }),
    );

  analytics
    .command("day <date>")
    .description(
      "Everything that happened on one day (YYYY-MM-DD): calls, callbacks, meetings",
    )
    .option(
      "--offset <utcOffset>",
      "timezone offset for the day boundaries, e.g. -04:00 (default UTC)",
    )
    .option(
      "--campaign <campaignId|none>",
      "restrict the calls to a campaign, or 'none' for calls outside any campaign",
    )
    .option("--outcome <outcomes...>", "only calls with these outcomes")
    .option("--no-callbacks", "skip the callbacks section")
    .option("--no-meetings", "skip the meetings section")
    .option("-l, --limit <n>", "max calls to return (default 50)", (v) =>
      parseInt(v, 10),
    )
    .action((date: string, opts) =>
      run(async () => {
        const res = await getClient().getDayActivity({
          date,
          utcOffset: opts.offset,
          campaignId: opts.campaign,
          outcome: opts.outcome as CallOutcome[] | undefined,
          includeCallbacks: opts.callbacks,
          includeMeetings: opts.meetings,
          limit: opts.limit,
        });
        if (wantsJson()) return json(res);

        heading(`${res.date} (${res.utcOffset})`);
        kv("calls", res.calls.total);
        Object.entries(res.calls.outcomeCounts).forEach(([outcome, count]) =>
          kv(`  ${outcome}`, count),
        );

        if (res.calls.items.length === 0) {
          warn("No calls that day.");
        } else {
          heading(`Calls (${res.calls.returned} of ${res.calls.total})`);
          res.calls.items.forEach((call) => {
            const who =
              call.contact?.name || call.contact?.phoneNumber || call.toNumber;
            const arrow = call.direction === "inbound" ? "←" : "→";
            line("");
            line(`${c.bold(`${arrow} ${who}`)}  ${c.gray(call.id)}`);
            kv("when", call.startedAt ?? call.createdAt);
            kv("duration", call.duration);
            kv("outcome", call.outcome);
            kv("note", call.outcomeNote);
          });
        }

        if (res.callbacks) {
          heading(`Callbacks (${res.callbacks.total})`);
          res.callbacks.items.forEach((cb) => {
            line("");
            printCallback(cb);
          });
        }

        if (res.meetings) {
          heading(`Meetings (${res.meetings.total})`);
          res.meetings.items.forEach((m) => {
            line("");
            line(`${c.bold(m.title || "(untitled)")}  ${c.gray(m.meetingId)}`);
            kv("at", m.scheduledAt);
            kv("duration", m.duration && `${m.duration} min`);
            kv("status", m.status);
            kv("location", m.location);
          });
        }
      }),
    );
}
