---
name: ringee-prospect
description: Prospect leads in Ringee with Apollo/Prospeo and convert them to contacts — search_leads, reveal_lead, import_leads_as_contacts. Use when the user wants to find new leads, unlock a lead's email/phone, or turn search results into Ringee contacts. Enforces credit-spend confirmation and the "leads are not contacts" rule.
---

# Ringee — Prospect

Turn external prospects into callable Ringee contacts via the connected Ringee
MCP. Three tools, in order.

## 1. `search_leads` (read)

Find candidates via the user's connected provider (Apollo preferred, else
Prospeo). Build filters from what the user said: `jobTitles`, `seniorities`,
`departments`, `industries`, `personCountries`, `companyDomains`, `companyNames`,
`employeeCountRanges`, `keywords`, `hasEmail`, `hasPhone`, `emailVerified`.

- Returns a `jobId` and a page of candidates, each with an `externalId`.
- **Candidates are NOT contacts** and have no email/phone unlocked yet
  (`emailsAvailable`/`phonesAvailable` only say whether data exists).
- Present compactly: name, title, company, location, confidence. Keep the `jobId`.

## 2. `reveal_lead` (SENSITIVE — spends credits)

Unlock email (and optionally phone via `revealPhone: true`) for **one** chosen
candidate; also upserts a Ringee contact so it's callable.

- **Always confirm first** — say it consumes credits and that `revealPhone` costs
  extra. Reveal only the candidate(s) the user picked.
- Needs the `jobId` + the candidate's `externalId`. Returns the new `contactId`.

## 3. `import_leads_as_contacts` (write)

Bulk-create contacts from selected candidates (does NOT unlock hidden email/phone
— use `reveal_lead` first if you need contact info). Skips phone duplicates. For a
large import, confirm the count first. Needs `jobId` + `externalIds`.

Never invent `jobId`/`externalId`. After converting, continue with a call session
(`ringee-session`). (Claude Code CLI fallback: `ringee leads search|reveal|import`.)
