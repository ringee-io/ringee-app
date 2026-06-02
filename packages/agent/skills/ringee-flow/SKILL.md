---
name: ringee-flow
description: Run the full Ringee outbound flow end to end (prospect → contact → call session → outcome → follow-up), one safe step at a time, via the connected Ringee MCP. Use when the user states a goal like "book demos with fintech founders in NYC" and wants to be driven through the whole process.
---

# Ringee — Outbound flow

Drive the outbound flow toward the user's goal using the connected Ringee MCP.
Advance ONE step at a time and confirm every sensitive/destructive step.

1. **Prospect** — `search_leads` (candidates, not contacts; keep the `jobId`).
2. **Reveal / Import** — confirm credit spend, then `reveal_lead` or
   `import_leads_as_contacts`.
3. **Contact** — ensure the prospect exists: `create_contact` / `update_contact`.
4. **Call session** — confirm, then `create_call_session`; share the `joinUrl` exactly.
5. **Call** — the user dials in Ringee (you don't place calls). Get the `callId`.
6. **Outcome** — `log_call_outcome`.
7. **Follow-up** — `create_callback` or `schedule_meeting`.

After each step, summarize the result and state the next recommended step. Stop
and ask whenever required info is missing or a sensitive/destructive action needs
confirmation. For depth on a step, see `ringee-prospect`, `ringee-contacts`,
`ringee-session`, `ringee-followup`. (Claude Code: the `ringee` CLI mirrors each step.)
