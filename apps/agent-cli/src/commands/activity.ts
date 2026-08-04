import { Command } from "commander";
import type {
  CallDetail,
  CallOutcome,
  CallStatus,
  CallbackStatus,
  DayActivityCallback as CallbackEntry,
} from "@ringee-io/agent";
import { getClient, run } from "../client.js";
import { c, heading, json, kv, line, ok, wantsJson, warn } from "../ui.js";

const CALLBACK_STATUSES: CallbackStatus[] = [
  "scheduled",
  "due",
  "in_progress",
  "completed",
  "missed",
  "cancelled",
];

function printCall(call: CallDetail, opts: { full: boolean }): void {
  const who = call.contact?.name || call.contact?.phoneNumber || call.toNumber;
  const arrow = call.direction === "inbound" ? "←" : "→";
  line(`${c.bold(`${arrow} ${who}`)}  ${c.gray(call.id)}`);
  kv("from", call.fromNumber);
  kv("to", call.toNumber);
  kv("status", call.status);
  kv("when", call.startedAt ?? call.createdAt);
  kv("duration", call.duration);
  kv("outcome", call.outcome);
  kv("note", call.outcomeNote);
  if (call.contact?.company) kv("company", call.contact.company);
  kv("recording", call.recordingUrl);
  if (call.transcription) {
    if (opts.full) {
      line(`  ${c.gray("transcript")}`);
      call.transcription.split("\n").forEach((l) => line(`    ${l}`));
    } else {
      const preview = call.transcription.replace(/\s+/g, " ").slice(0, 140);
      const ellipsis = call.transcription.length > 140 ? "…" : "";
      kv("transcript", `${preview}${ellipsis}`);
    }
  }
}

const OUTCOMES: CallOutcome[] = [
  "meeting_booked",
  "sale",
  "interested",
  "follow_up",
  "callback_scheduled",
  "not_interested",
  "no_answer",
  "voicemail",
  "wrong_number",
  "gatekeeper",
];

export function printCallback(cb: CallbackEntry): void {
  const who = cb.contact?.name || cb.contact?.phoneNumber || "(unknown)";
  line(`${c.bold(who)}  ${c.gray(cb.callbackId)}`);
  kv("at", cb.scheduledAt);
  kv("status", cb.status);
  kv("phone", cb.contact?.phoneNumber);
  kv("company", cb.contact?.company);
  kv("campaign", cb.campaign?.name);
  kv("note", cb.note);
  kv("completed", cb.completedAt);
}

export function registerActivity(program: Command): void {
  const calls = program.command("calls").description("Browse call history");

  calls
    .command("list")
    .description(
      "List calls with full detail — outcome, transcription and recording URL",
    )
    .option("--contact <contactId>", "filter to one contact's calls")
    .option(
      "--campaign <campaignId|none>",
      "only this campaign's calls, or 'none' for calls outside any campaign",
    )
    .option(
      "--outcome <outcomes...>",
      `filter by outcome (one or more of: ${OUTCOMES.join(", ")})`,
    )
    .option("--status <statuses...>", "filter by status (e.g. completed)")
    .option("--from <iso>", "only calls created at or after this ISO datetime")
    .option("--to <iso>", "only calls created at or before this ISO datetime")
    .option("--full", "print the full transcription instead of a preview")
    .option("-p, --page <n>", "page number", (v) => parseInt(v, 10))
    .option("-l, --limit <n>", "page size (max 50)", (v) => parseInt(v, 10))
    .action((opts) =>
      run(async () => {
        const res = await getClient().listCalls({
          contactId: opts.contact,
          campaignId: opts.campaign,
          // Raw argv strings; the client's zod schema validates them.
          outcome: opts.outcome as CallOutcome[] | undefined,
          status: opts.status as CallStatus[] | undefined,
          dateFrom: opts.from,
          dateTo: opts.to,
          page: opts.page,
          limit: opts.limit,
        });
        if (wantsJson()) return json(res);
        if (res.calls.length === 0) {
          warn("No calls matched.");
          return;
        }
        heading(`${res.total} call(s) — page ${res.page}/${res.totalPages}`);
        res.calls.forEach((call) => {
          line("");
          printCall(call, { full: !!opts.full });
        });
      }),
    );

  program
    .command("outcomes")
    .description("Log call outcomes")
    .command("log <callId> <outcome>")
    .description(`Record a call outcome. One of: ${OUTCOMES.join(", ")}`)
    .option("--note <note>", "free-text follow-up note")
    .action((callId: string, outcome: string, opts) =>
      run(async () => {
        const res = await getClient().logCallOutcome({
          callId,
          outcome: outcome as CallOutcome,
          outcomeNote: opts.note,
        });
        if (wantsJson()) return json(res);
        ok(`Outcome logged: ${res.outcome}`);
        kv("call", res.callId);
        kv("note", res.outcomeNote);
      }),
    );

  const callbacks = program
    .command("callbacks")
    .description("List and schedule callbacks");

  callbacks
    .command("list")
    .description("List scheduled callbacks, soonest first")
    .option(
      "--status <status>",
      `filter by status (${CALLBACK_STATUSES.join(", ")})`,
    )
    .option("-p, --page <n>", "page number", (v) => parseInt(v, 10))
    .option("-l, --limit <n>", "page size (max 50)", (v) => parseInt(v, 10))
    .action((opts) =>
      run(async () => {
        const res = await getClient().listCallbacks({
          status: opts.status as CallbackStatus | undefined,
          page: opts.page,
          limit: opts.limit,
        });
        if (wantsJson()) return json(res);
        if (res.callbacks.length === 0) {
          warn("No callbacks matched.");
          return;
        }
        heading(
          `${res.total} callback(s) — page ${res.page}/${res.totalPages}`,
        );
        res.callbacks.forEach((cb) => {
          line("");
          printCallback(cb);
        });
      }),
    );

  callbacks
    .command("create <contactId> <scheduledAt>")
    .description(
      "Schedule a callback (scheduledAt = ISO-8601 with offset, future)",
    )
    .option("--call <callId>", "source call id")
    .option("--note <note>")
    .action((contactId: string, scheduledAt: string, opts) =>
      run(async () => {
        const res = await getClient().createCallback({
          contactId,
          scheduledAt,
          callId: opts.call,
          note: opts.note,
        });
        if (wantsJson()) return json(res);
        ok("Callback scheduled.");
        kv("id", res.callbackId);
        kv("at", res.scheduledAt);
        kv("status", res.status);
      }),
    );

  program
    .command("meetings")
    .description("Schedule meetings")
    .command("schedule <contactId> <scheduledAt>")
    .description("Book a meeting (scheduledAt = ISO-8601 with offset)")
    .option("--title <title>")
    .option("--duration <minutes>", "default 30", (v) => parseInt(v, 10))
    .option("--location <location>", "address or video URL")
    .option(
      "--email <attendeeEmail>",
      "external attendee (sends invite if calendar connected)",
    )
    .option(
      "--call <callId>",
      "source call id (sets outcome to meeting_booked)",
    )
    .option("--notes <notes>")
    .action((contactId: string, scheduledAt: string, opts) =>
      run(async () => {
        const res = await getClient().scheduleMeeting({
          contactId,
          scheduledAt,
          title: opts.title,
          duration: opts.duration,
          location: opts.location,
          attendeeEmail: opts.email,
          callId: opts.call,
          notes: opts.notes,
        });
        if (wantsJson()) return json(res);
        ok("Meeting scheduled.");
        kv("id", res.meetingId);
        kv("at", res.scheduledAt);
        kv("duration", res.duration);
        kv("status", res.status);
      }),
    );
}
