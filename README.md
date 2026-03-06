<p align="center">
  <a href="https://ringee.io/" target="_blank">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://www.ringee.io/logos/white.logo.png">
    <img alt="Ringee Logo" src="https://www.ringee.io/logos/white.logo.png" width="280"/>
  </picture>
  </a>
</p>

<p align="center">
<a href="https://opensource.org/license/agpl-v3">
  <img src="https://img.shields.io/badge/License-AGPL%203.0-blue.svg" alt="License">
</a>
</p>

<div align="center">
  <strong>
  <h2>Your open-source global calling & communication infrastructure</h2><br />
  <a href="https://ringee.io">Ringee</a>: An alternative to expensive VoIP providers — 50× cheaper than traditional phone rates.<br /><br />
  </strong>
  Ringee offers everything you need to make and receive crystal-clear calls to 180+ countries,<br />manage contacts, record calls, and scale your sales team — right from your browser.
</div>

<p align="center">
  <br />
  <a href="https://ringee.io" rel="dofollow"><strong>Explore the platform »</strong></a>
  <br />

  <br/>
  <a href="https://www.youtube.com/watch?v=WiHE9RFmECc" rel="dofollow"><strong>Watch the YouTube Tutorials »</strong></a>
  <br />
</p>

<p align="center">
  <a href="https://app.ringee.io/auth/sign-up">Register</a>
  ·
  <a href="https://github.com/ringee-co/ringee/issues">Report Bug</a>
  ·
  <a href="https://github.com/ringee-co/ringee/issues">Request Feature</a><br />
</p>

<br />

## 🔌 See Ringee in action

<p align="center">
  <a href="https://www.youtube.com/watch?v=WiHE9RFmECc" target="_blank">
    <img alt="Ringee - Setup to make calls in under 30 seconds" src="https://img.youtube.com/vi/WiHE9RFmECc/maxresdefault.jpg" width="700"/>
  </a>
</p>

<p align="center"><em>📞 💨 Setup to make local and international calls in under 30 seconds</em></p>

## ✨ Features

| <a href="https://youtu.be/EBgjagSuHMg"><img src="https://img.youtube.com/vi/EBgjagSuHMg/hqdefault.jpg" width="400"/></a> | <a href="https://youtu.be/VLWXO9K45vM"><img src="https://img.youtube.com/vi/VLWXO9K45vM/hqdefault.jpg" width="400"/></a> |
| :---: | :---: |
| **Import 5,000 Contacts & Organize with Tags** | **Team Calling Analytics Dashboard** |
| <a href="https://youtu.be/UK22507tZf0"><img src="https://img.youtube.com/vi/UK22507tZf0/hqdefault.jpg" width="400"/></a> | <a href="https://www.youtube.com/watch?v=WiHE9RFmECc"><img src="https://img.youtube.com/vi/WiHE9RFmECc/hqdefault.jpg" width="400"/></a> |
| **Import Contacts — No Manual Work** | **Setup & Call in Under 30 Seconds** |

<br />

- 📞 **Make & Receive Global Calls** — Call 180+ countries right from your browser. No apps, no SIM cards.
- 🌍 **Universal Reach** — Connect to landlines and mobile phones. The recipient doesn't need internet or any app.
- 🔊 **WebRTC Telephony** — Powered by Telnyx WebRTC for crystal-clear, low-latency voice.
- 🎙️ **Call Recording** — Record conversations for quality assurance, training, or compliance.
- 👥 **Contact Management** — Import thousands of contacts via CSV, organize them with tags, and search instantly.
- 💰 **Cost Effective** — 50× cheaper than traditional phone rates. Buy numbers from 180+ countries.
- 📊 **Analytics** — See your whole team's calling metrics in one dashboard: calls per day, per month, per agent.
- 🔐 **Authentication** — Powered by Clerk for secure, multi-tenant team management.
- 💳 **Billing & Payments** — Stripe integration for credits, subscriptions, and phone number purchases.
- 🔔 **Push Notifications** — Firebase Cloud Messaging for real-time call notifications.
- 🏗️ **Open Source** — Self-host the entire infrastructure, or use our hosted service.

# Intro

- Schedule calls, manage contacts, and track performance across your entire team.
- At the moment there is no difference between the hosted version and the self-hosted version.
- Perfect for building your own scalable VoIP infrastructure, cold calling platform, or call center.
- Built for automation — integrate with your existing tools via the REST API.

## Tech Stack

- **Monorepo:** pnpm workspaces
- **Frontend:** Next.js (React) — B2B admin + B2C consumer apps
- **Backend:** NestJS (REST & Webhooks)
- **Worker:** NestJS background job processor
- **Database:** PostgreSQL with Prisma ORM
- **Cache:** Redis
- **Telephony:** Telnyx WebRTC
- **Auth:** Clerk
- **Payments:** Stripe
- **Notifications:** Firebase Cloud Messaging
- **Storage:** Cloudflare R2
- **Email:** Resend

## Quick Start

To have the project up and running, please follow the [Quick Start Guide](CONTRIBUTING.md).

**Or use Docker:**

```bash
git clone https://github.com/ringee-co/ringee.git
cd ringee
cp .env.example .env   # Fill in your API keys
docker-compose -f docker-compose.app.yml up --build -d
```

Then open:
- Admin frontend → http://localhost:4200
- Consumer frontend → http://localhost:4201

## Sponsor Ringee

We've made Ringee open-source to empower developers globally to enhance, learn from, and deploy their own communication infrastructure. Any contributions via pull requests or sponsorships are highly appreciated!

- **Just a donation:** You like what we are building, and want to buy us some coffees so we can build faster.
- **Main Repository:** Get your logo with a backlink from the main Ringee repository.

## Ringee Compliance

- Ringee is an open-source, self-hosted communication tool that supports telephony via Telnyx.
- Ringee hosted service uses official, platform-approved API flows.
- Ringee does not collect, store, or proxy API keys or access tokens from users.
- Users always authenticate directly with the service providers (Clerk, Telnyx, Stripe), ensuring compliance and data privacy.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ringee-co/ringee&type=date&legend=top-left)](https://www.star-history.com/#ringee-co/ringee&type=date&legend=top-left)

## License

This repository's source code is available under the [AGPL-3.0 license](LICENSE).
