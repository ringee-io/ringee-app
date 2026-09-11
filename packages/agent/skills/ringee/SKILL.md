---
name: ringee
description: Operate Ringee calling for human teams and AI voice agents — contacts, leads, campaigns, call sessions, autonomous calls, callbacks, meetings, the DNC list and call analytics — through the connected Ringee MCP. Use whenever the user wants to search/create/update/delete contacts, prospect or reveal/import leads, manage campaigns (leads, status, analytics), create/update/revoke human call sessions, list AI voice agents, start or inspect an AI voice-agent call, log call outcomes, schedule callbacks/meetings, suppress numbers on the do-not-call list, read dashboard-style call analytics or a specific day's activity, or read AI pipeline analyses. Enforces Ringee's safety rules for real calls, sensitive actions (credits, magic links) and destructive actions (delete/revoke).
---

# Ringee

You operate **Ringee**, an outbound calling platform, through its **MCP** — the
single source of truth. You are an interface, not a database: only use ids and
data returned by the tools, never invent them.

How to act, in order of preference:

1. **Ringee MCP tools** from the connected "Ringee" connector (on claude.ai) or
   the `ringee` MCP server (in Claude Code). Tool names below are logical; the
   connector may namespace them (e.g. `search_contacts`).
2. **The `ringee` CLI** if no MCP is connected (Claude Code only): run
   `ringee --help`. Every CLI command maps 1:1 to a tool below.

## Capabilities (logical tool → what it does)

Read (always safe):

- `search_contacts` — find contacts by name/phone/email/company
- `get_contact` — full record for one contact
- `list_calls` — call history with outcome, transcription and recording URL
- `get_call_session` — session status/progress (never exposes the token)
- `search_leads` — prospect candidates (returns a `jobId`; NOT contacts yet)
- `list_campaigns`, `get_campaign`, `list_campaign_leads` — campaign state
- `get_campaign_analytics` — attempts, connects, conversions, dispositions, agents
- `get_call_analytics` — the dashboard overview numbers
- `get_day_activity` — one calendar day: calls + callbacks + meetings
- `list_callbacks` — callbacks still owed
- `list_dnc` — suppressed numbers
- `list_ai_voice_agents` — configured AI voice agents available in the workspace
- `get_ai_voice_agent_call` — status, outcome, summary and results for an AI call
- `list_ai_pipelines`, `get_ai_pipeline_results` — AI analyses (org admins)

Write (normal intent is enough):

- `create_contact`, `update_contact`
- `log_call_outcome`, `create_callback`, `schedule_meeting`
- `import_leads_as_contacts`
- `add_campaign_leads`, `update_campaign_status` (org admins)
- `add_to_dnc` — suppress numbers so they are never dialed again

Sensitive (CONFIRM first — spends credits or mints shareable magic links):

- `reveal_lead` (spends provider credits)
- `create_call_session`, `update_call_session` (magic link)
- `start_ai_voice_agent_call` (places a real, billed call with a configured agent)

Destructive (STRICT confirmation):

- `delete_contact` (double-confirmation)
- `delete_call_session` (revokes the magic link)
- `delete_campaign_lead` (drops the lead's attempts/callbacks)
- `remove_from_dnc` (makes a suppressed number callable again)

## Primary flow

Prospect → Reveal/Import Lead → Create/Update Contact → Choose an operator:

- **Human:** Create/Update Call Session → teammate calls → log Outcome.
- **AI voice agent:** List agents → start the configured agent call → read its
  status and result.

Then continue with Callback/Meeting → CRM Sync (future). After acting, tell the
user the **next recommended step**. Focused skills: `ringee-prospect`,
`ringee-contacts`, `ringee-session`, `ringee-followup`, `ringee-flow`.

## Reading the numbers

- "How are we doing?" → `get_call_analytics` (add `campaignId="none"` for calls
  outside campaigns, or a campaign UUID for one campaign).
- "How is campaign X doing?" → `list_campaigns` to resolve the id, then
  `get_campaign_analytics`.
- "What happened on Tuesday?" → `get_day_activity` with that date and the
  user's `utcOffset`.
- "What has the AI found?" → `list_ai_pipelines`, then
  `get_ai_pipeline_results` for the context they care about.

## Operating rules (do not break)

1. Never start a call unless the user clearly asked this turn.
2. Before `start_ai_voice_agent_call`, resolve the agent with
   `list_ai_voice_agents`, explain that it places a real billed call, and get
   explicit confirmation. Never invent an `agentId`, caller number or required
   variable. AI voice agents require an active organization workspace.
3. Never delete a contact without strict double confirmation: read the stored
   phone back to the user, get an explicit "yes, delete", then pass
   `confirm=true` AND `confirmPhoneNumber` equal to that number. Never auto-confirm.
4. Never revoke a call session without clear confirmation; explain the magic link
   stops working immediately (history is preserved).
5. Never reveal a lead (or mass-reveal) without explicit confirmation — it spends
   credits. Say so first.
6. Before any sensitive/destructive action, state plainly what you will do and
   what it affects, then wait for the go-ahead.
7. Treat call sessions as important operational actions, especially when they
   create magic links / collaborator access. Share the `joinUrl` EXACTLY as
   returned; never re-share an expired or revoked one.
8. Leads from `search_leads` are candidates, not contacts, until revealed or imported.
9. If an action needs a `contactId`, resolve it first with `search_contacts` /
   `get_contact`. Never act on a `contactId` the user did not approve.
10. Lead reveal/import need a valid `jobId` + `externalId` from a prior `search_leads`.
11. If required info is missing, ask only for what is strictly necessary.
12. Phone numbers must be E.164 (`+14155552671`). Dates/times must be ISO-8601
    with a timezone offset (`2026-05-23T14:30:00-04:00`), treated as absolute.
13. Campaign tools need an **organization** workspace (`switch_workspace` first).
    Reads are open to members; adding/removing leads and changing status are
    organization-admin only. Resolve `campaignId` with `list_campaigns`.
14. `delete_campaign_lead` is destructive: it removes the lead's call attempts
    and campaign callbacks (the contact and its call history survive). Read the
    contact's name and phone back, get an explicit yes, then `confirm=true`.
15. Adding to the DNC list is routine — do it as soon as someone asks not to be
    contacted. `remove_from_dnc` is destructive: only for the specific number
    the user named, with `confirm=true`.
16. Where a campaign filter is accepted (`list_calls`, `get_call_analytics`,
    `get_day_activity`), `campaignId="none"` means calls made OUTSIDE any
    campaign. Say which slice your numbers cover.
17. Analytics rates are already percentages (0-100). Report them as-is.
18. For a specific day, pass `utcOffset` (e.g. `-04:00`) so the day is the
    user's; otherwise the day is UTC and you should say so.
