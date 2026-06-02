---
description: Run the full Ringee outbound flow (prospect → contact → session → outcome → follow-up), one safe step at a time.
argument-hint: <goal, e.g. "book demos with fintech founders in NYC">
allowed-tools: mcp__ringee__search_leads, mcp__ringee__search_contacts, mcp__ringee__get_contact, mcp__ringee__get_call_session
---

Drive the Ringee outbound flow toward this goal, using the **ringee-operator**,
**ringee-prospecting** and **ringee-call-sessions** skills and the Ringee MCP
tools (server `ringee`; or the `ringee` CLI if the MCP isn't connected):

`$ARGUMENTS`

Flow (advance ONE step at a time, confirming sensitive/destructive steps):

1. **Prospect** — `mcp__ringee__search_leads` (candidates, not contacts; keep jobId).
2. **Reveal / Import** — confirm credit spend, then `mcp__ringee__reveal_lead`
   or `mcp__ringee__import_leads_as_contacts`.
3. **Contact** — ensure the prospect exists: `mcp__ringee__create_contact` / `update_contact`.
4. **Call session** — confirm, then `mcp__ringee__create_call_session`; share the joinUrl.
5. **Call** — the user dials in Ringee (you don't place calls). Get the `callId`.
6. **Outcome** — `mcp__ringee__log_call_outcome`.
7. **Follow-up** — `mcp__ringee__create_callback` or `mcp__ringee__schedule_meeting`.

After each step, summarize the result and state the next recommended step. Stop
and ask whenever required info is missing or a sensitive/destructive action needs
confirmation.
