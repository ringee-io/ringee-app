---
description: Log a call outcome and schedule the next touch (callback or meeting).
argument-hint: <what happened on the call + next step>
allowed-tools: mcp__ringee__search_contacts, mcp__ringee__get_contact
---

Use the **ringee-operator** skill and the Ringee MCP tools (server `ringee`) to
record follow-up:

`$ARGUMENTS`

Steps (or the `ringee` CLI if the MCP isn't connected):
- Log a call outcome (needs a real `callId`): `mcp__ringee__log_call_outcome`.
  Outcomes: meeting_booked, sale, interested, follow_up, callback_scheduled,
  not_interested, no_answer, voicemail, wrong_number, gatekeeper.
- Schedule a callback (resolve the contact first): `mcp__ringee__create_callback`
  with `contactId` + a future ISO-8601 datetime with offset.
- Book a meeting: `mcp__ringee__schedule_meeting` with `contactId` + datetime,
  optional `title`, `duration`, `attendeeEmail`.

Dates must be ISO-8601 with a timezone offset (e.g. 2026-06-02T15:00:00-04:00) and
are absolute. Resolve any `contactId`/`callId` from prior tool output — never invent ids.
