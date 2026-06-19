---
title: "GEO + SEO Audit — Ringee"
brand_name: "Ringee"
domain: "ringee.io"
geo_score: "74"
audit_target: "http://localhost:4200 (dev build)"
canonical_origin: "https://www.ringee.io"
business_type: "SaaS — outbound calling software"
date: "2026-06-19"
location: "Generative Engine Optimization (GEO-first, SEO-supported)"
---

# GEO + SEO Audit — Ringee

**Composite GEO Score: 74 / 100 — Good (strong foundation, off-site authority + freshness are the gaps)**

> **Audit target:** `http://localhost:4200` (local Next.js **dev** server). All on-page structure, schema, copy, robots, sitemap, and llms.txt findings hold for production *as long as prod emits the same output*. Performance, caching, and security-header findings are **dev-only and must be re-checked against `https://www.ringee.io`** — they live at the edge/CDN, not the dev server. Every canonical, `og:url`, schema `url`, robots `Host`, and sitemap `<loc>` already points to the production origin `https://www.ringee.io`, which is correct.

---

## Score Summary

| Category | Weight | Score | Weighted | Verdict |
|---|---|---|---|---|
| AI Citability & Visibility | 25% | **82/100** | 20.5 | Excellent |
| Brand Authority Signals | 20% | **62/100*** | 12.4 | Fair (on-page proxy) |
| Content Quality & E-E-A-T | 20% | **64/100** | 12.8 | Fair–Good |
| Technical Foundations | 15% | **91/100** | 13.65 | Excellent |
| Structured Data | 10% | **72/100** | 7.2 | Good |
| Platform Optimization | 10% | **74/100** | 7.4 | Good |
| **Composite** | **100%** | | **73.95 → 74** | **Good** |

\* Brand Authority could not be measured live from a localhost build. Score reflects **on-page entity readiness** (sameAs, consistent naming, contactPoint), which is strong; the true off-site footprint (Wikipedia/Wikidata, G2/Capterra, Reddit, YouTube) appears thin and should be treated as the biggest untracked risk/opportunity.

---

## The Big Picture

Ringee already does the hard, structural things most SaaS marketing sites get wrong:

- **Full server-side rendering** — AI crawlers that don't run JS (GPTBot, ClaudeBot, PerplexityBot) see the complete `<head>`, JSON-LD, headings, and body copy in raw HTML.
- **Wide-open, intentional AI crawler access** — robots.txt explicitly allows `OAI-SearchBot` and `ChatGPT-User`; nothing but app/auth routes is disallowed.
- **A rich, spec-compliant `llms.txt`** with plain-text pricing, an agentic positioning, and an honest SOC 2 disclaimer.
- **Schema on every page** — SoftwareApplication, Organization (sameAs + contactPoint), Product/Offer, FAQPage, BreadcrumbList.
- **Radical honesty** — no fabricated reviews, no fake `aggregateRating`, and a `/security` page that openly states what Ringee does *not* claim (no SOC 2 / ISO 27001). This is a genuine, AI-rewarded trust asset.

What's holding the score at 74 instead of 85+ is **not** on-page structure — it's three cross-cutting gaps that each suppress multiple categories at once:

1. **Zero freshness signals** — no `datePublished`/`dateModified` anywhere.
2. **No off-site authority** — no Wikipedia/Wikidata entity, no third-party reviews, no community footprint, and an **empty Testimonials placeholder**.
3. **No comparison/alternatives content** — the single highest-intent AI-search format, and Ringee is well-positioned to own it.

Plus a handful of **duplicate JSON-LD entities** that are easy to fix and disproportionately drag the Structured Data score.

---

## Critical Findings (fix first)

### 🔴 C1 — Duplicate / conflicting JSON-LD entities
Confirmed by both the schema and AI-visibility analyses.

- **Homepage emits two `SoftwareApplication` blocks** for the same entity with *divergent* descriptions (one carries `license: MIT`, the other a longer agentic description). Two competing definitions of one entity confuse extractors about which is canonical.
- **`features/call-recording` redeclares the whole app** with a second, page-specific `SoftwareApplication`. A feature page should not redeclare the product.
- **Integration & use-case detail pages emit `BreadcrumbList` twice, byte-for-byte identical** (e.g. `/integrations/claude`, `/use-cases/sdr-teams`).

**Root cause:** a layout-level schema component and a page-level schema component are both firing. Pick one source of truth.
**Note:** the earlier "10 ld+json blocks" counts were inflated — Next.js serializes each block once as a real `<script>` and once inside the RSC streaming payload (`self.__next_f`). Actual rendered counts are half. The duplicates above are *real* DOM duplicates, separate from that artifact.
**Fix location:** `apps/frontend/src/app/(marketing)/layout.tsx` + the per-route schema components under `apps/frontend/src/features/marketing`.

### 🔴 C2 — No freshness signals anywhere
No `datePublished` / `dateModified` in any JSON-LD, and no `article:modified_time` meta. Google AI Overviews, Perplexity, and Gemini all favor and often *require* freshness to cite. This is a low-effort, high-impact fix — inject `dateModified` into the page schema (sitemap already has `lastmod`, so the data exists).

### 🔴 C3 — Empty Testimonials placeholder / no social proof
A `Testimonials` key exists in the i18n bundle but **renders nothing**. Combined with no `/about` page (404), no case studies, and no named customers, the site has strong honesty but **zero proof**. Either ship 2–3 real named quotes or a single case study with a metric — or remove the empty section so it doesn't read as unfinished.

---

## High-Priority Opportunities

### 🟠 H1 — Build comparison / alternatives pages
Confirmed absent: `/compare`, `/alternatives`, `/compare/aircall` all 404, and nothing in the sitemap. "Best outbound dialer," "Aircall/JustCall/Kixie alternative," and "X vs Y" are among the highest-intent AI-search queries, and AI engines preferentially cite comparison-table pages. Create `/compare/<competitor>` (Aircall, JustCall, Kixie, Orum) + an `/alternatives` hub with extractable tables (flat vs per-seat pricing, self-host, agentic/MCP, open source). This single initiative moves **all five platforms** and Content + Citability at once.

### 🟠 H2 — Add `/llms-full.txt`
`/llms.txt` is excellent but `/llms-full.txt` returns 404. Concatenating the full marketing-page bodies (home, pricing, features, security, key use-cases) into one root markdown file is the highest-leverage single GEO win — it lifts the llms.txt sub-score from ~78 to ~92.

### 🟠 H3 — Create an `/about` page (currently 404)
The missing Authoritativeness/Expertise anchor. Add company story, who's behind Ringee, and founder/team `Person` schema. AI engines look for entity identity; right now it rests entirely on schema + GitHub.

### 🟠 H4 — Establish off-site entity authority
Create a Wikidata item; pursue G2 / Capterra / Product Hunt listings; seed authentic Reddit (r/sales, r/recruiting) and a Product Hunt launch (Perplexity's dominant ranking input). Then add all of these to `Organization.sameAs`. Wikipedia/Wikidata is the strongest long-term AI entity-recognition lever.

### 🟠 H5 — Add `WebSite + SearchAction` schema + verify production security headers
- Add a `WebSite` entity (with `SearchAction` if site search exists) to the homepage — entity anchor + sitelinks search box. *(Snippet below.)*
- Run `curl -I https://www.ringee.io` and confirm HSTS, CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options`/`frame-ancestors`, and `Referrer-Policy` are present. None appear on the dev server (expected); add via `next.config` `headers()` if the edge doesn't inject them. Disable `X-Powered-By`.

---

## Medium / Low Priority (polish)

| # | Finding | Area | Effort |
|---|---|---|---|
| M1 | **Duplicate `theme-color` meta** — `#09090b` and `#ffffff`, neither has a `media` attr, so light silently overrides dark. Scope with `media: (prefers-color-scheme: …)`. | Technical | Low |
| M2 | **Over-length meta** — home description 315 chars, pricing 234 (trim to ~155); titles for features (70), integrations (69), use-cases (73) will truncate (≤60). | Technical | Low |
| M3 | **Deepen thin/templated subpages** — feature/use-case pages run one short sentence per section (home 503 words, open-source 275). Target ~800–1,200 words with a concrete example/number each. | Content | Med |
| M4 | **Add FAQPage to the features hub** — the only content page missing one. | Content/Schema | Low |
| M5 | **Add `speakable` to FAQ/Product pages**; upgrade `Organization.logo` to `ImageObject` w/ dimensions; add `availability` to offers. | Schema | Low |
| M6 | **Replace unverifiable superlatives** ("Kings of cost-efficiency", "Nobody scales outbound cheaper") with the quotable math already on-page ("a 12-seat team pays $20/mo flat vs ~$360/mo on per-seat tools — ~$4,080/yr saved"). | Content/Citability | Low |
| M7 | **Add proprietary/original data** — per-destination rate snippet, open-source star/contributor count, savings-calculator methodology. Uniqueness is the weakest citability dimension. | Content | Med |
| M8 | **Add `Content-Signal:` to robots.txt** (`search=yes, ai-train=yes, ai-retrieval=yes`) to make AI access intentional, not inherited. | Crawlers | Low |
| M9 | **Bridge the off-domain blog** (`blog.ringee.io`) — surface 3–5 posts per subpage and add to `sameAs`, so topical-authority signals reach the marketing domain. | Content | Med |
| M10 | **Bing/IndexNow + agent discovery** — no `msvalidate.01`, no IndexNow (`/indexnow.txt` 404). Given the MCP/CLI-first product, consider advertising an MCP server card / API catalog via `Link:` header or `.well-known`. | Platform | Low |
| M11 | **Downgrade footer `<h2>` labels** (Product/Company/etc.) to non-heading markup so the per-page heading outline stays content-focused. Add `og:locale = en_US`. | Technical | Low |

---

## Category Detail

### AI Citability & Visibility — 82/100 (Excellent)
- **Crawler access: 100.** robots.txt allows all AI bots (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Bingbot, Applebot-Extended all inherit `Allow: /`); explicit allow blocks for OAI-SearchBot + ChatGPT-User; only `/dashboard /auth /dialer /api /monitoring` disallowed (correct).
- **Citability: ~82.** Most quotable assets: the pricing FAQ (question-style headings + hard numbers), the llms.txt "Key facts" list, and the `/security` honesty block. Weakest dimension is **uniqueness** — claims are restated across pages with no proprietary data.
- **llms.txt: ~78.** Spec-compliant, absolute links; capped by missing `/llms-full.txt` and bare `- Title: url` link formatting (no per-link descriptions, no `## Optional` section).

### Brand Authority Signals — 62/100 (on-page proxy)
Strong on-page entity readiness: `Organization` with `sameAs` (X, LinkedIn, GitHub) + `contactPoint`, consistent "Ringee"/"Ringee.io" naming, resource links to docs/blog/npm/App Store. Gaps: no Wikipedia/Wikidata, no review-platform presence, empty testimonials, and no verifiable community footprint. **Live off-site presence was not measurable from localhost.**

### Content Quality & E-E-A-T — 64/100 (Fair–Good)
- **Trustworthiness is the standout (20/25)** — radical honesty, real contact, no fabricated claims.
- **Experience (9/25) is weakest** — no case studies, no first-hand data, no outcomes.
- Subpages are visibly **templated** (intro → who/challenge → benefits → how → related → FAQ, one sentence each). Pricing is the exception with real explanatory copy + cost comparison.
- FAQPage + question-style headings on 7 of 8 content pages make the content genuinely citable; the gap is substance, not structure.

### Technical Foundations — 91/100 (Excellent)
- Flawless SSR; correct **self-canonicals on every page** (no "all → home" bug); clean hierarchical URLs; rich internal linking with **no broken links** across 11 sampled child routes; one H1 per page; 100% image alt on sampled pages.
- Real gaps are minor: duplicate theme-color, over-length meta/titles, and **production security headers to verify** (dev server returns none — expected).

### Structured Data — 72/100 (Good)
- 100% JSON-LD, server-rendered, zero parse errors; pricing in schema exactly matches visible pricing.
- Dragged down by the **duplicate SoftwareApplication / BreadcrumbList** entities (C1), missing **WebSite + SearchAction**, missing **speakable**, incomplete **sameAs**, and `logo` as a bare URL.

### Platform Optimization — 74/100 (Good)
| Platform | Rating | Why |
|---|---|---|
| ChatGPT / OAI-SearchBot | **Strong (84)** | Explicit allow, native ChatGPT integration page, rich llms.txt, dense FAQ |
| Google AI Overviews | **Strong (78)** | Clean SSR + schema + query-shaped FAQ; held back by **no dates**, no comparison content |
| Perplexity | **Moderate (66)** | Good source directness; **no community/review validation** (its dominant input), no dates |
| Gemini | **Moderate (64)** | sameAs present but no Wikidata/KG entity, no YouTube, no GBP |
| Bing Copilot | **Moderate (60)** | No `msvalidate.01`, no IndexNow, thin Microsoft-ecosystem signals |

---

## Ready-to-Paste JSON-LD

**WebSite + SearchAction** (homepage — drop the action if there's no site search endpoint; the `WebSite` entity alone is still worth shipping):
```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Ringee",
  "alternateName": "Ringee.io",
  "url": "https://www.ringee.io",
  "publisher": { "@type": "Organization", "name": "Ringee.io", "url": "https://www.ringee.io" },
  "potentialAction": {
    "@type": "SearchAction",
    "target": { "@type": "EntryPoint", "urlTemplate": "https://www.ringee.io/search?q={search_term_string}" },
    "query-input": "required name=search_term_string"
  }
}
```

**Upgraded Organization** (one canonical copy; fills sameAs, adds description/foundingDate, upgrades logo):
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Ringee.io",
  "url": "https://www.ringee.io",
  "logo": { "@type": "ImageObject", "url": "https://www.ringee.io/android-chrome-512x512.png", "width": 512, "height": 512 },
  "description": "Open-source, self-hostable outbound calling software for SDR teams, recruiters, agencies, and freelancers — calls, campaigns, recording and transcription, CRM sync, and AI automation.",
  "foundingDate": "[REPLACE: YYYY]",
  "sameAs": [
    "https://x.com/ringeeio",
    "https://www.linkedin.com/company/ringee-io",
    "https://github.com/ringee-io",
    "[REPLACE: Wikidata once an entity exists]",
    "[REPLACE: Crunchbase]",
    "[REPLACE: YouTube]"
  ],
  "contactPoint": { "@type": "ContactPoint", "telephone": "+18094055531", "contactType": "customer support", "availableLanguage": "English" }
}
```

---

## 30-Day Action Plan

**Week 1 — Quick structural wins (mostly low-effort code):**
1. De-duplicate JSON-LD (C1) — one SoftwareApplication, one BreadcrumbList per page.
2. Inject `dateModified` into page schema (C2).
3. Fix the empty Testimonials section (C3) — ship real quotes or remove it.
4. Head hygiene (M1, M2): scope theme-color, trim meta descriptions/titles.
5. Verify production security headers (H5).

**Week 2 — AI-discovery surface:**
6. Ship `/llms-full.txt` (H2) and add per-link descriptions + `## Optional` to `llms.txt`.
7. Add `WebSite + SearchAction`, `speakable`, FAQ-on-features-hub (H5/M4/M5).
8. Add `Content-Signal:` to robots.txt (M8).

**Weeks 3–4 — Content & authority (the real score-movers):**
9. Build `/about` with `Person` schema (H3).
10. Build comparison + `/alternatives` pages with extractable tables (H1).
11. Start off-site authority: Wikidata item, Product Hunt, G2/Capterra, seeded Reddit (H4).
12. Deepen the top 5 subpages from boilerplate to substance + add proprietary data (M3, M7).

**Highest leverage:** comparison pages (H1), `/llms-full.txt` (H2), dates (C2), and de-duped schema (C1) — together they lift Structured Data, Platform Optimization, Content, and Citability simultaneously.

---

*Audit run against a localhost dev build on 2026-06-19. Re-run `curl -I https://www.ringee.io` and re-verify robots/llms/schema parity on production before treating dev-only findings as resolved.*
