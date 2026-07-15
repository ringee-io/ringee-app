---
name: ringee-contacts
description: Search, view, create, update or delete Ringee contacts via the connected Ringee MCP (search_contacts, get_contact, create_contact, update_contact, delete_contact). Use when the user wants to find a contact, see details, add or edit one, or delete one. Enforces strict double-confirmation before deleting.
---

# Ringee — Contacts

Manage the user's Ringee contacts through the connected Ringee MCP.

- **Find**: `search_contacts` — show id, name, phone, company.
- **Details**: `get_contact`.
- **Create**: `create_contact` — `phoneNumber` is REQUIRED and must be E.164
  (`+14155552671`); it must be unique within the user/organization.
- **Update**: resolve the contact first (`search_contacts`/`get_contact`), then
  `update_contact`. Only send the fields that change.
- **Delete** (DESTRUCTIVE): NEVER without double confirmation. First
  `get_contact`, read the stored phone number back to the user, get an explicit
  "yes, delete", then call `delete_contact` with `confirm=true` AND
  `confirmPhoneNumber` equal to that stored phone. Never auto-confirm.

If you don't know which contact is meant, ask — resolve to one `contactId` before
writing. End by stating what changed and the suggested next step (e.g. queue a
call session). Codex CLI fallback: `ringee contacts search|get|create|update|delete`.
