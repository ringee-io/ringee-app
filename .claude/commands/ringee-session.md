---
description: Create, inspect, update or revoke a Ringee call session (magic-link dialing).
argument-hint: <create | status <id> | update <id> | revoke <id>>
allowed-tools: mcp__ringee__get_call_session, mcp__ringee__search_contacts
---

Use the **ringee-call-sessions** skill and the Ringee MCP tools (server `ringee`)
for this session request:

`$ARGUMENTS`

Rules (or the `ringee` CLI if the MCP isn't connected):
- **Create** (SENSITIVE — mints a magic link): confirm first, ensure each contact
  exists with a valid E.164 phone (`mcp__ringee__search_contacts`), then
  `mcp__ringee__create_call_session`. Share the returned `joinUrl` EXACTLY; it
  cannot be re-fetched.
- **Status**: `mcp__ringee__get_call_session` — report status/progress/expiry.
- **Update** (SENSITIVE): `mcp__ringee__update_call_session`. Replacing the queue
  is only allowed before the first call.
- **Revoke** (DESTRUCTIVE): confirm clearly, explain the link dies immediately
  (history kept), then `mcp__ringee__delete_call_session`.

Ask only for what's missing. End with the next recommended step (dial → log outcome).
