---
name: ringee-session
description: Create, inspect, update or revoke Ringee call sessions (magic-link dialing) via the connected Ringee MCP (create_call_session, get_call_session, update_call_session, delete_call_session). Use when the user wants a dialing queue, a shareable dialer link, session progress, queue changes, or to revoke access. Treats sessions as sensitive operational actions.
---

# Ringee — Call sessions

A **call session** is a queue of contacts/numbers plus a **magic link**
(`joinUrl`) that lets the user — or a collaborator, without logging in — dial
through them and record outcomes. Treat sessions as important operational actions.

- **Create** (SENSITIVE — mints a magic link): confirm first; explain a shareable
  link will be created and who can use it. Provide an ordered `contacts` queue
  (prefer `contactId` per entry; otherwise an E.164 `phoneNumber`). Optional:
  `title`, `campaignId`, `expiresInMinutes` (default 60), `maxCalls`. Returns
  `callSessionId` + `joinUrl` — **share the `joinUrl` EXACTLY**; the token is
  embedded once and cannot be re-fetched.
- **Status**: `get_call_session` — `status`, `contactsCount`, `callsCompleted`,
  `expiresAt`, `joinUrlAvailable` (never re-exposes the token).
- **Update** (SENSITIVE): `update_call_session` — change `title`, swap/detach
  `campaignId` (pass `null` to detach), extend `expiresInMinutes`, or replace the
  queue (only before the first call). Confirm before changing a live session.
- **Revoke** (DESTRUCTIVE): `delete_call_session` — require clear confirmation;
  explain the magic link stops working immediately for everyone (history kept).

Before creating, ensure each contact exists with a valid E.164 phone. Never
re-share an expired or revoked link — create a new session. Codex CLI
fallback: `ringee sessions create|get|update|revoke`.
