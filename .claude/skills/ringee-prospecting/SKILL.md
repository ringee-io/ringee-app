---
name: ringee-prospecting
description: Prospect and convert leads in Ringee using Apollo/Prospeo — search_leads, reveal_lead, import_leads_as_contacts. Use when the user wants to find new leads, unlock a lead's email/phone, or turn search results into Ringee contacts. Enforces credit-spend confirmation and the "leads are not contacts" rule.
---

# Ringee prospecting

Turns external prospects into callable Ringee contacts. Three tools, used in order.

## 1. `search_leads` (read)

Find candidates via the user's connected provider (Apollo preferred, else Prospeo).
Build filters from what the user said: `jobTitles`, `seniorities`, `departments`,
`industries`, `personCountries`, `companyDomains`, `companyNames`,
`employeeCountRanges`, `keywords`, `hasEmail`, `hasPhone`, `emailVerified`.

- Returns a `jobId` and a page of candidates, each with an `externalId`.
- **Candidates are NOT contacts.** They have no email/phone unlocked yet
  (`emailsAvailable` / `phonesAvailable` only say whether data exists).
- Present results compactly: name, title, company, location, confidence.
- Keep the `jobId` — every follow-up needs it.

CLI: `ringee leads search --title "VP Sales" --country US --industry SaaS`

## 2. `reveal_lead` (SENSITIVE — spends credits)

Unlock email (and optionally phone with `revealPhone: true`) for **one** chosen
candidate. Also upserts a Ringee contact, so the lead becomes immediately callable.

- **Always confirm first.** State that it consumes provider credits, and that
  `revealPhone` costs extra. Reveal only the candidate(s) the user picked.
- Requires the `jobId` from step 1 and the candidate's `externalId`.
- Returns the new/updated `contactId` plus revealed emails/phones.

CLI: `ringee leads reveal <jobId> <externalId> --phone --yes`

## 3. `import_leads_as_contacts` (write)

Bulk-create contacts from selected candidates. Does NOT unlock hidden email/phone —
use `reveal_lead` first if you need contact info. Skips duplicates by phone.

- For a large import, confirm the count first.
- Requires the `jobId` and an array of `externalIds`.

CLI: `ringee leads import <jobId> <externalId1> <externalId2> ...`

## Guidance

- Choose reveal vs import by intent: reveal = "I want to call this person now",
  import = "add these to my list".
- After converting, continue the outbound flow: create/confirm the contact, then
  a call session (see `ringee-call-sessions`).
- Never invent `jobId`/`externalId`. If the search expired, run `search_leads` again.
