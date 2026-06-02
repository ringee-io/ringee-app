---
description: Search, view, create, update or delete Ringee contacts.
argument-hint: <search terms | "create ..." | "delete ...">
allowed-tools: mcp__ringee__search_contacts, mcp__ringee__get_contact
---

Use the **ringee-operator** skill and the Ringee MCP tools (server `ringee`) to
handle this contact request:

`$ARGUMENTS`

Tools (or the `ringee` CLI if the MCP isn't connected):
- Find a contact: `mcp__ringee__search_contacts` (CLI: `ringee contacts search "<q>"`). Show id, name, phone, company.
- View details: `mcp__ringee__get_contact`.
- Create: `mcp__ringee__create_contact` — `phoneNumber` is required and E.164.
- Update: resolve the contact first, then `mcp__ringee__update_contact`.
- **Delete** (destructive): NEVER without double confirmation. First read the
  contact back with `mcp__ringee__get_contact`, read the stored phone to the user,
  get an explicit "yes, delete", then call `mcp__ringee__delete_contact` with
  `confirm=true` and `confirmPhoneNumber` equal to that stored phone.

If anything required is missing (e.g. which contact), ask only for that. End by
stating what you did and the suggested next step.
