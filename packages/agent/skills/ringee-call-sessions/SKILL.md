---
name: ringee-call-sessions
description: Create and manage Ringee call sessions — magic-link dialing queues — with create_call_session, get_call_session, update_call_session, delete_call_session. Use when the user wants to set up a calling queue, share a dialer link with a collaborator, check session progress, change a queue, or revoke access. Treats sessions as sensitive operational actions.
---

# Ringee call sessions

A **call session** is a queue of contacts/numbers plus a **magic link** (`joinUrl`)
that lets the user — or a collaborator, without logging in — dial through them one
by one and record outcomes. Treat sessions as important operational actions.

## `create_call_session` (SENSITIVE — mints a magic link)

- **Confirm first.** Explain a shareable link will be created and who can use it.
- Provide an ordered `contacts` queue. Prefer `contactId` per entry (UI shows
  name/company); otherwise a `phoneNumber` in E.164 is required.
- Optional: `title`, `campaignId`, `expiresInMinutes` (default 60), `maxCalls`.
- Returns `callSessionId` and `joinUrl`. **Share the `joinUrl` EXACTLY as
  returned.** The raw token is embedded once and cannot be re-fetched. Use
  `get_call_session` afterwards to check status — it never re-exposes the token.

CLI: `ringee sessions create --contact <id1> --contact <id2> --title "Tue outbound"`

## `get_call_session` (read)

Safe metadata only: `status`, `contactsCount`, `callsCompleted`, `expiresAt`,
`joinUrlAvailable`. Use to report progress.

CLI: `ringee sessions get <callSessionId>`

## `update_call_session` (SENSITIVE)

Change `title`, swap/detach `campaignId` (pass `null` to detach), extend
`expiresInMinutes`, or **replace the queue** — replacing `contacts` is only
allowed before the first call has started. Confirm before changing a live session.

CLI: `ringee sessions update <callSessionId> --title "Renamed" --expires 1440`

## `delete_call_session` (DESTRUCTIVE — revoke)

A revoke, not a hard delete: past calls are preserved, but the magic link stops
working immediately. **Require clear confirmation** and explain that anyone
holding the link loses access at once.

CLI: `ringee sessions revoke <callSessionId> --yes`

## Guidance

- Before creating, make sure each contact exists and has a valid E.164 phone
  (resolve with `search_contacts`).
- After the user dials and you have a `callId`, log the outcome (`log_call_outcome`)
  and schedule the next touch (callback/meeting).
- Never re-share an expired or revoked link; create a new session instead.
