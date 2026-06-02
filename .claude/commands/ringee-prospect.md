---
description: Prospect leads (Apollo/Prospeo) and convert them to Ringee contacts.
argument-hint: <who to find, e.g. "VP Sales at SaaS in the US">
allowed-tools: mcp__ringee__search_leads
---

Use the **ringee-prospecting** skill and the Ringee MCP tools (server `ringee`)
to prospect:

`$ARGUMENTS`

Steps (or the `ringee` CLI if the MCP isn't connected):
1. `mcp__ringee__search_leads` with filters derived from the request (jobTitles,
   seniorities, departments, industries, personCountries, companyNames/domains,
   keywords). Present candidates compactly and KEEP the `jobId`. Remind the user
   these are candidates, not contacts.
2. To unlock a chosen candidate (SENSITIVE — spends credits): confirm first, then
   `mcp__ringee__reveal_lead` with the `jobId` + `externalId` (set `revealPhone`
   only if asked; it costs extra).
3. To add several as contacts: `mcp__ringee__import_leads_as_contacts` with the
   `jobId` + selected `externalIds` (confirm the count for large imports).

Never invent `jobId`/`externalId` — only use values from the search output. After
converting, suggest continuing with a call session (`/ringee-session`).
