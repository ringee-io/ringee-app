---
name: ringee-followup
description: Log a call outcome and schedule the next touch (callback or meeting) in Ringee via the connected Ringee MCP (log_call_outcome, create_callback, schedule_meeting). Use after a call to record how it went and to book the follow-up.
---

# Ringee — Follow-up

Record results and schedule the next touch through the connected Ringee MCP.

- **Log outcome**: `log_call_outcome` needs a real `callId`. Outcomes:
  meeting_booked, sale, interested, follow_up, callback_scheduled, not_interested,
  no_answer, voicemail, wrong_number, gatekeeper. Add an `outcomeNote` if useful.
- **Callback**: resolve the contact first, then `create_callback` with `contactId`
  and a future ISO-8601 datetime with offset (e.g. 2026-06-02T15:00:00-04:00).
- **Meeting**: `schedule_meeting` with `contactId` + datetime; optional `title`,
  `duration` (default 30), `location`, `attendeeEmail` (sends an invite when a
  calendar is connected), `callId` (sets that call's outcome to meeting_booked).

Datetimes are absolute and must include a timezone offset. Resolve any
`contactId`/`callId` from prior tool output — never invent ids. Claude Code CLI
fallback: `ringee outcomes log` · `ringee callbacks create` · `ringee meetings schedule`.
