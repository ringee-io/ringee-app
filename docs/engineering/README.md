# Ringee engineering documentation

System knowledge, separated from agent instructions on purpose:

- **`/AGENTS.md` and the directory-level `AGENTS.md` files** = what to do and not
  do while changing code. Short, always loaded.
- **`docs/engineering/`** = how the system actually works. Read on demand.

| Document | Read it when |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | You need the layer map, the workspaces, or the real build/test commands |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | Any change that touches behaviour. Rules carry stable IDs (`WRK-001`, `BILL-003`, …) |
| [WORKSPACES.md](WORKSPACES.md) | Auth, tenancy, roles, or anything workspace-scoped |
| [TELEPHONY.md](TELEPHONY.md) | Calls, numbers, caller IDs, recordings, webhooks, campaigns |
| [BILLING.md](BILLING.md) | Credits, Stripe, pricing, margins, the ledgers |
| [SECURITY.md](SECURITY.md) | Public routes, signatures, tokens, secrets, encryption |
| [INTEGRATIONS.md](INTEGRATIONS.md) | SDK, CLI, extension, MCP, CRM, Attio, outbound webhooks |
| [CANONICAL_IMPLEMENTATIONS.md](CANONICAL_IMPLEMENTATIONS.md) | Before writing any new helper, service or abstraction |
| [ARCHITECTURE_DEBT.md](ARCHITECTURE_DEBT.md) | You hit something that looks wrong — check whether it is known, and whether it was already fixed |
| [decisions/](decisions/) | You are making a decision future readers will have to live with |

## Conventions

- Everything here is derived from the code as it exists. Where a rule could not
  be verified it is marked **`Needs confirmation`** — treat those as open
  questions, not as policy.
- Proposed improvements are kept out of the rule documents and live in
  `ARCHITECTURE_DEBT.md`, so "what is true" never blurs into "what should be".
- Reference rules by ID (`BILL-002`) in code comments, PRs and issues.
