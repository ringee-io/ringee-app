import { Command } from "commander";
import type { CallOutcome } from "@ringee-io/agent";
import { getClient, run } from "../client.js";
import { json, kv, ok, wantsJson } from "../ui.js";

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

export function registerActivity(program: Command): void {
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

  program
    .command("callbacks")
    .description("Schedule callbacks")
    .command("create <contactId> <scheduledAt>")
    .description("Schedule a callback (scheduledAt = ISO-8601 with offset, future)")
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
    .option("--email <attendeeEmail>", "external attendee (sends invite if calendar connected)")
    .option("--call <callId>", "source call id (sets outcome to meeting_booked)")
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
