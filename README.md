![Ringee Logo](https://www.ringee.io/logos/white.logo.png)

[![License: AGPL 3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://opensource.org/license/agpl-v3)

## Open-source global calling & communication infrastructure

**Ringee** is an open-source platform for building and operating browser-based voice calling at scale.  
Make and receive calls worldwide, manage contacts, record conversations, and monitor team performance — with a modern, self-hostable stack.

**Links**

- Website: https://ringee.io
- Docs: https://docs.ringee.io
- Tutorials: https://www.youtube.com/watch?v=WiHE9RFmECc
- Register: https://www.ringee.io/auth/sign-up
- Issues: https://github.com/ringee-io/ringee/issues

---

## Demo

[![Ringee demo: setup and first call](https://img.youtube.com/vi/WiHE9RFmECc/maxresdefault.jpg)](https://www.youtube.com/watch?v=WiHE9RFmECc)

_Setup and place your first call in under 30 seconds._

---

## Features

### Video highlights

|                                                                                                                                 |                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [![Import contacts and organize with tags](https://img.youtube.com/vi/EBgjagSuHMg/hqdefault.jpg)](https://youtu.be/EBgjagSuHMg) | [![Team calling analytics dashboard](https://img.youtube.com/vi/VLWXO9K45vM/hqdefault.jpg)](https://youtu.be/VLWXO9K45vM)          |
| **Import contacts and organize with tags**                                                                                      | **Team calling analytics dashboard**                                                                                               |
| [![Bulk import via CSV](https://img.youtube.com/vi/UK22507tZf0/hqdefault.jpg)](https://youtu.be/UK22507tZf0)                    | [![Quick setup and first call](https://img.youtube.com/vi/WiHE9RFmECc/hqdefault.jpg)](https://www.youtube.com/watch?v=WiHE9RFmECc) |
| **Bulk import via CSV (no manual work)**                                                                                        | **Quick setup and first call**                                                                                                     |

### Product capabilities

- Global calling to 180+ countries from the browser (WebRTC).
- Connects to landlines and mobile phones; recipients do not need an app.
- Call recording for quality assurance, training, and compliance workflows.
- Contact management with CSV import, tagging, and fast search.
- Team analytics: calls per agent, day, and month, plus activity visibility.
- Multi-tenant authentication and organization management.
- Billing and credits via Stripe; phone number purchasing supported.
- Real-time notifications via Firebase Cloud Messaging.
- Open-source and self-hostable (hosted version available).

---

## Documentation

Full documentation: **https://docs.ringee.io**

---

## Overview

- Schedule calls, manage contacts, and track performance across your entire team.
- Hosted and self-hosted deployments currently provide the same feature set.
- Suitable for building VoIP infrastructure, sales dialers, calling platforms, or call-center systems.
- Designed for automation and integrations through a REST API.

---

## Tech Stack

- **Monorepo:** pnpm workspaces
- **Frontend:** Next.js (React) — B2B admin app
- **Backend:** NestJS (REST & Webhooks)
- **Worker:** NestJS background job processor
- **Database:** PostgreSQL + Prisma ORM
- **Cache:** Redis
- **Telephony:** Telnyx WebRTC
- **Auth:** Clerk
- **Payments:** Stripe
- **Notifications:** Firebase Cloud Messaging
- **Storage:** Cloudflare R2
- **Email:** Resend

---

## Quick Start

Start here: **[Quick Start](CONTRIBUTING.md)**

Or run with Docker:

```bash
git clone https://github.com/ringee-io/ringee.git
cd ringee
cp .env.example .env
docker-compose -f docker-compose.app.yml up --build -d
```

Open:

- Admin → http://localhost:4200

---

## Agent layer (`@ringee-io/agent`)

A thin agent layer lets Claude, Claude Code/OpenClaw, the `ringee` CLI and a
ChatGPT App operate Ringee on top of the **existing backend/MCP** — which stays
the single source of truth. No business logic is duplicated.

```
Ringee backend / MCP  (apps/backend — source of truth)
        │
        ▼
@ringee-io/agent      (packages/agent — clients · schemas · flows · prompts · rules)
        │
        ├── ringee CLI      (apps/agent-cli)
        ├── Claude Skills   (packages/agent/skills → /comandos in Claude Code & claude.ai)
        └── ChatGPT App     (apps/chatgpt-app)
```

Capabilities mirror the MCP: search/get/create/update/delete contacts, log call
outcomes, callbacks, meetings, create/update/get/revoke call sessions, and lead
prospecting (search/reveal/import via Apollo/Prospeo). AI voice agents can be
listed and triggered through MCP or the CLI; creation and editing remain in the
dashboard. Sensitive actions (credits, billed calls, magic links) and destructive
ones (delete/revoke) require explicit confirmation.

```bash
# CLI (configure RINGEE_MCP_URL or RINGEE_BACKEND_URL + RINGEE_USER_ID)
pnpm ringee config check
pnpm ringee contacts search acme
pnpm ringee leads search --title "VP Sales" --country US

# ChatGPT App: polished component gallery + the MCP endpoint
pnpm dev:chatgpt-app          # http://localhost:4202 (UI preview)
pnpm chatgpt-app:mcp          # http://localhost:4250/mcp (connect ChatGPT here)

# Install the Claude Skills into a project's .claude/ (Claude Code)
pnpm agent:install-skills
# Package the skills as .zip for upload to claude.ai
pnpm agent:package-skills
```

The skills create `/ringee`, `/ringee-prospect`, `/ringee-contacts`,
`/ringee-session`, `/ringee-followup` and `/ringee-flow` — usable both in
**Claude Code** and the **claude.ai** chatbot.

### Distribution

**Claude Code** — this repo is also a plugin marketplace
(`/.claude-plugin/marketplace.json` + `packages/agent/.claude-plugin/`):

```text
/plugin marketplace add ringee-io/ringee-app
/plugin install ringee@ringee-io
```

**claude.ai (chatbot)** — add the Ringee MCP as a custom Connector, then upload
the skill zips (Settings → Customize → Skills). The `/ringee…` commands then work
in chat. See [`PUBLISHING.md`](PUBLISHING.md).

**ChatGPT App** — an Apps SDK MCP server (`apps/chatgpt-app`) with inlined visual
widgets, an OAuth 2.1 scaffold and a Dockerfile.

See [`PUBLISHING.md`](PUBLISHING.md) for the full publish runbook, plus
[`packages/agent/README.md`](packages/agent/README.md),
[`apps/agent-cli/README.md`](apps/agent-cli/README.md) and
[`apps/chatgpt-app/README.md`](apps/chatgpt-app/README.md).

---

## Sponsorship

Ringee is open-source to help developers and teams deploy their own communication infrastructure.  
Contributions and sponsorships are appreciated.

- Donations help fund development and maintenance.
- Sponsors may receive attribution in the main repository (logo + backlink).

---

## Compliance

- Ringee is an open-source, self-hosted communication tool integrating with Telnyx for telephony.
- Hosted deployments use official, platform-approved API flows.
- Ringee does not collect, store, or proxy provider API keys or access tokens.
- Users authenticate directly with providers (Clerk, Telnyx, Stripe).

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ringee-io/ringee-app&type=date&legend=top-left)](https://www.star-history.com/#ringee-io/ringee-app&type=date&legend=top-left)

---

## License

This repository is licensed under the **[AGPL-3.0](LICENSE)**.
