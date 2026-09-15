---
name: ringee-flow
description: Run the full Ringee outbound flow end to end (prospect → contact → human or AI call → result → follow-up), one safe step at a time, via the connected Ringee MCP. Use when the user states a goal like "book demos with fintech founders in NYC" and wants to be driven through the whole process.
---

# Ringee — Outbound flow

Drive the outbound flow toward the user's goal using the connected Ringee MCP.
Advance ONE step at a time and confirm every sensitive/destructive step.

1. **Prospect** — `search_leads` (candidates, not contacts; keep the `jobId`).
2. **Reveal / Import** — confirm credit spend, then `reveal_lead` or
   `import_leads_as_contacts`.
3. **Contact** — ensure the prospect exists: `create_contact` / `update_contact`.
4. **Choose the operator** — use the human or AI path the user requests:
   - **Human:** confirm, then `create_call_session`; share the `joinUrl` exactly.
     The user or their teammate joins Ringee and places the call. Get the `callId`.
   - **AI voice agent:** `list_ai_voice_agents`, resolve an active configured
     agent and its requirements, explain that this will place a real billed call,
     then get explicit confirmation before `start_ai_voice_agent_call`. Never
     invent an `agentId`, caller number or required variable. This path needs an
     active organization workspace.
5. **Result** — for a human call, use `log_call_outcome`; for an AI voice-agent
   call, use `get_ai_voice_agent_call` to read its status, outcome, summary and
   configured extraction results.
6. **Follow-up** — `create_callback` or `schedule_meeting` when the result calls
   for a next step.

After each step, summarize the result and state the next recommended step. Stop
and ask whenever required info is missing or a sensitive/destructive action needs
confirmation. For depth on a step, see `ringee-prospect`, `ringee-contacts`,
`ringee-session`, `ringee-followup`. (Claude Code: the `ringee` CLI mirrors each step.)
