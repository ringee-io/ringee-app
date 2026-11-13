# Product analytics and error tracking (Stage 4B)

PostHog measures acquisition, first value, payment and retention, and tracks the
technical failures of the journeys that lead there. Ringee stays the source of
truth for calls, meetings, credits and authorizations: PostHog is for analysis,
never for a decision. Rules: `OBS-001`..`OBS-004` in
[BUSINESS_RULES.md](BUSINESS_RULES.md). Plan: `docs/product/PLAN_ORGANIZATION_STAGE_4_POSTHOG.md`.

## Owners

| Runtime                   | Owner                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider adapter          | `PostHogProductAnalyticsProvider` behind `PRODUCT_ANALYTICS_PROVIDER` — `packages/platform/src/analytics/` (the only `posthog-node` import)                              |
| Backend facts             | `ProductAnalyticsService` — `packages/services/src/services/analytics/`: `record` after a commit, cursor projectors over durable evidence, `drain`                       |
| Delivery                  | Temporal schedule `ringee.product-analytics-drain` (60 s) → `ProductAnalyticsService.tick`                                                                               |
| Backend error tracking    | `ProductAnalyticsService.captureException`; services reach it through `captureJourneyException` (`analytics/journey-exceptions.ts`)                                      |
| Browser events            | `useAnalytics` (`packages/frontend-shared/src/hooks/use.analytics.ts`) → `lib/analytics/posthog.ts`; the only `posthog-js` import                                        |
| Browser identity          | `useAnalyticsIdentity`, mounted once in `AppMainSidebar`, from `GET /api/analytics/identity`                                                                             |
| Pageviews (Web Analytics) | `PostHogPageviews` in the root layout — the only place `$pageview` is captured                                                                                           |
| Uncaught browser errors   | Sentry (`instrumentation-client.ts`, `global-error.tsx`) — unchanged. PostHog exception autocapture is off, so the same exception is never reported twice inside PostHog |

## Configuration

| Variable                                                       | Where       | Meaning                                                                                                                                                |
| -------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POSTHOG_PROJECT_TOKEN`                                        | API, worker | Project token (`phc_…`), an ingestion key. Unset → nothing is recorded or sent (the default).                                                          |
| `POSTHOG_HOST`                                                 | API, worker | Ingestion host of the project's region (`https://us.i.posthog.com` or `https://eu.i.posthog.com`). An invalid value disables analytics, never the API. |
| `POSTHOG_ENABLED`                                              | API, worker | `false` is the server kill switch, token or not.                                                                                                       |
| `POSTHOG_ERROR_TRACKING_ENABLED`                               | API, worker | `false` switches off exception capture alone.                                                                                                          |
| `RINGEE_ENVIRONMENT`, `RINGEE_RELEASE`                         | API, worker | Tags on every fact and exception (`production` / `staging`, the deployed commit).                                                                      |
| `NEXT_PUBLIC_POSTHOG_KEY`                                      | Frontend    | The same project token. Unset → the browser loads nothing.                                                                                             |
| `NEXT_PUBLIC_POSTHOG_HOST`                                     | Frontend    | Same region as the server.                                                                                                                             |
| `NEXT_PUBLIC_RINGEE_ENVIRONMENT`, `NEXT_PUBLIC_RINGEE_RELEASE` | Frontend    | Tags; fall back to Vercel's `VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA` when exposed.                                                                       |

No personal or management API key is used anywhere in the product. Dashboards,
cohorts and experiments are created in the PostHog UI (or with a personal key
kept outside the repository, never in a Ringee runtime).

**Project and region (to decide at provisioning):** one project per environment
(production, staging) so test data never mixes with real funnels; the US or EU
region must match the data-residency answer given to customers. Turn on Group
Analytics with group type `workspace` before the first event — events sent
before the group type exists are not re-grouped.

**Grant and usage:** the startup credit funds Ringee's own analytics; customer
billing is unchanged (Ringee credits, BILLING.md). Confirm the grant's start,
expiry and covered products in the PostHog billing page before budgeting, set
per-product billing limits and the usage alerts, and review the weekly
projection. Group Analytics bills on every identified event of the project.
Limits can stop ingestion: Ringee keeps working, and the outbox marks undelivered
facts `failed` after its retries, for reconciliation.

**Source maps and releases:** releases are tagged on every fact and exception
(`release_version`). Backend stacks are readable as compiled. Browser source maps
are uploaded to Sentry by the existing `withSentryConfig`; uploading them to
PostHog needs the PostHog CLI in the frontend build with a personal key held by
the build system — a provisioning step, not wired here.

## Identity and groups

- Human distinct id: the internal Ringee user UUID, on both client and server.
  The browser identifies with it after sign-in (`posthog.identify`), which links
  the anonymous acquisition visits of that browser; sign-out resets it.
- Group `workspace`: `personal:<ownerId>` or `organization:<organizationId>`
  (`workspaceKeyOf`, disjoint key spaces). Every scoped event carries
  `workspace_key` and `workspace_type`, also after a workspace switch. Anonymous
  visits have no group — none is invented.
- AI and system facts use technical distinct ids (`ai:<workspace>`,
  `system:<workspace>`): they count as workspace results, never as human activity
  or acquisition.

## Backend facts (allowlisted in `event-contract.ts`)

| Event                                        | Source                                                                          | Key (dedup)                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `signup_completed`                           | projector: `User` rows                                                          | user id                                                                 |
| `workspace_created`                          | projector: `Organization` rows (creator known)                                  | organization id                                                         |
| `first_list_completed`                       | `OnboardingService.completeFirstList`                                           | user + workspace                                                        |
| `credit_grant_recorded`                      | projector: `CreditGrant` ledger (never a purchase)                              | grant id                                                                |
| `credit_checkout_started`                    | Stripe checkout/intent creation (`entry_point` bounded)                         | session / intent id                                                     |
| `credit_topup_confirmed`                     | projector: completed `CreditTopup` (`is_first_paid_topup`)                      | topup id                                                                |
| `human_call_connected`                       | hangup hook (`InboxTimelineService.recordEndedCall`), CALL-012 answered, not AI | call id                                                                 |
| `call_outcome_recorded`                      | `PendingActionService.recordHumanOutcome` (manual + campaign)                   | call id + outcome revision                                              |
| `number_lookup_completed`                    | `NumberPurchasedService.lookupInventory`                                        | per lookup                                                              |
| `line_acquired`                              | projector: number bought / caller ID verified                                   | number id                                                               |
| `followup_configuration_saved`               | `VoiceAgentAutomationService.saveFollowUpConfiguration`                         | activation + revision                                                   |
| `followup_adoption_authorized`               | adoption (and its projector)                                                    | activation + adoption time                                              |
| `followup_control_applied`                   | pause / resume                                                                  | automation + control + time                                             |
| `followup_reminder_planned`                  | projector: `MeetingReminderExecution` rows                                      | execution id                                                            |
| `followup_objective_started/resolved/closed` | projector: objective event history                                              | event id                                                                |
| `followup_business_result_recorded`          | projector: definitive `MeetingAutomationAction` (AGENT-020)                     | action id — one business result even when it also resolves an objective |

Common envelope: `schema_version`, `event_id` (the outbox UUID, derived from the
key), `occurred_at`, `actor_type`, `environment`, `release_version`,
`workspace_key`, `workspace_type`, `organization_id` when it applies. Projectors
start at the time they first run (no silent backfill). For late commits a second
cursor per source (`<source>:late`) trails the first by 15 minutes and reads
every row again, page by page across ticks, so no window is cut at one page;
keys make every re-read a no-op. Retention prunes delivered and skipped facts
after 30 days; `failed` ones stay for reconciliation.

## Browser events (allowlisted in `lib/analytics/events.ts`)

Exposure and interaction only: `followup_invitation_shown/dismissed`,
`followup_review_opened` (with `entry_source`), `followup_review_row_saved`,
`followup_capability_toggled`, `followup_activation_clicked/failed`,
`followup_value_summary_viewed/action`, `readiness_blocker_shown`,
`readiness_recovery_started`, `first_list_offer_shown`, `test_call_modal_shown`,
`test_call_intent`, `test_call_dial_attempted`, `number_search_recovery_clicked`,
`credit_topup_opened`, plus `$pageview`/`$pageleave`. Autocapture, heatmaps,
dead clicks, replay, surveys and flags are off.

The first test call is measured in four separate steps, so an automatic
exposure is never read as somebody's intent:

| Step                     | Event                                                    | When                                                                                                                                |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Exposure                 | `test_call_modal_shown` (`trigger: automatic`)           | My day opened the test-call modal on its own: no list, no queue, no first-list setup. Once per user and workspace in that browser   |
| Intent                   | `test_call_intent` (`surface: test_call_modal`)          | The person saved the number to call in that modal (once per opening)                                                                |
| Attempt                  | `test_call_dial_attempted`                               | Their explicit dial of that list's entry — "Call next" or N, once. Nothing dials from the modal itself                              |
| Connected                | `human_call_connected` (backend)                         | The call was answered (CALL-012); `is_first_for_workspace`, `caller_id_kind` tell the first call and the shared line apart          |
| Blocker (no line at all) | `readiness_blocker_shown` / `readiness_recovery_started` | `blocker: no_line` with `surface: test_call_modal` or `first_list_ready`, and `action: buy_number` / `verify_number` on the way out |

`entry_source` is one of `first_list`, `interested_outcome`, `meeting_booked`,
`ai_voice_agents_navigation`.

## Data protection

Never captured: contacts' phones, emails or names, meeting titles, notes,
transcripts, recordings, credentials, tokens, full URLs. Enforced in code:

- Per-event property allowlists on both sides; anything else is dropped before
  it is stored or sent. Strings that are not short codes are redacted.
- URLs keep origin, a path whose personal/opaque segments are replaced, and only
  `utm_*`/`ref`/click-id parameters (`sanitizeUrl`, also in the browser's
  `before_send`); `$elements` chains are dropped.
- Exceptions: message, nested causes and stack are redacted (quoted text,
  emails, digit runs ≥ 7, URLs beyond their host, known secret prefixes, long
  tokens, `key=value` with sensitive keys) and frame context lines and locals are
  removed (`scrubExceptionEvent`). Tests feed synthetic sensitive values
  (`sanitize.test.ts`, `product-analytics.service.spec.ts`).
- `ip: false` and `disableGeoip` in both SDKs.

## Error tracking coverage

Scoped, technical failures only — expected blockers (no balance, no inventory,
cancelled checkout, no calendar) are product states, not exceptions:

| Journey                         | Where                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Number lookup                   | provider failure in `NumberPurchasedService.lookupInventory`; browser review/load failures       |
| First call                      | browser journey captures (`useAnalytics().captureException`)                                     |
| Meeting booking                 | confirmation planning failure after a booking (`MeetingService`)                                 |
| AI preparation and activation   | unexpected adoption failure (`VoiceAgentAutomationService.adoptFollowUp`); review load (browser) |
| Reminder and callback execution | `MeetingReminderCallService`, `CallbackService` (dial, recovery planning)                        |
| Receipts and settlement         | `MeetingEmailService` delivery; `VoiceAgentBillingService` settle/debit                          |

Each capture carries `component`, `operation`, `journey_step`, `severity`,
`error_code` (normalized), `environment`, `release_version`, the workspace group
and opaque correlation ids. A capture never throws, never awaits delivery and
never changes retries, claims or leases.

## Dashboards (definitions — create in PostHog)

All insights are aggregated by the `workspace` group unless they are about
people (acquisition). Exclude `environment != production` and internal
workspaces (a cohort maintained in PostHog).

### 1. Acquisition and first call

- Funnel (persons): `$pageview` with `utm_source` set → `signup_completed` →
  `first_list_completed` → `human_call_connected` (`is_first_for_workspace`) →
  `credit_topup_confirmed` (`is_first_paid_topup = true`), 14-day window, broken
  down by `utm_source`. Report end to end, including people who never reached a
  list.
- Time to first call: median time `signup_completed` → first
  `human_call_connected`.
- Test call (workspaces): `test_call_modal_shown` → `test_call_intent` →
  `test_call_dial_attempted` → `human_call_connected`
  (`is_first_for_workspace`), 24-hour window, broken down by `line`.
- Blockers: `readiness_blocker_shown` by `blocker` and `surface`; recovery:
  `readiness_recovery_started` → `line_acquired` / `credit_topup_confirmed`.
- First paid top-up: only workspaces with no earlier paid top-up
  (`is_first_paid_topup`); `credit_grant_recorded` shown separately.

### 2. AI adoption and retention

- Funnel (workspaces): `followup_invitation_shown` → `followup_review_opened` →
  `followup_adoption_authorized` → `followup_reminder_planned` or
  `followup_objective_started` (readiness) →
  `followup_business_result_recorded` (`counts_as_value = true`), split by
  `entry_source`. A human-booked meeting is an entry source; its AI confirmation
  is the result.
- Opportunity-conditioned: the same funnel restricted to workspaces with a
  `call_outcome_recorded` (`outcome = interested`) or a booked meeting in the
  window, beside the end-to-end one.
- First result of all time vs first after adoption: `after_adoption` on the
  result fact.
- Retention: cohorts by the week of the first verified result; week 1 and week 4
  require another distinct `followup_business_result_recorded` (AI) — and,
  separately, another `human_call_connected` (repeated human calling). Show only
  mature cohorts and whether another opportunity existed in the window.
- Pauses and reactivations: `followup_control_applied`.

### 3. Reliability and conversion impact

- Affected workspaces: unique workspaces with `$exception` by `journey_step`,
  per release (`release_version`).
- Failures per attempted step: `$exception` count / attempts (`number_lookup_completed`,
  `followup_activation_clicked`, `followup_reminder_planned`).
- Expected blockers vs technical failures side by side (`readiness_blocker_shown`
  vs `$exception`), recovery rate, and regressions by `release_version`.

Reconcile counts daily against Ringee (ledger, meetings, objectives) by event
key; mark ingestion windows that are still incomplete.

## Experiment drafts (Stage 4E — not launched)

Workspace-level assignment (`workspace` group), stable for every member and
worker; pricing, eligibility and consent identical across variants. Validate the
split and data quality, and wait for cohort maturity, before reading results.

**E1 — Clear test-call guidance vs the current presentation.**
Population: new workspaces that reach My day with no list. Exposure: the start
state rendered (`test_call_modal_shown`, or `first_list_offer_shown` where the
modal was not opened). Primary
metric: workspaces with `human_call_connected` (first) within 24 h of exposure.
Window 24 h; duration until both arms reach the sample computed from the
measured baseline (≥ 2 weeks). Guardrails: blocked calls, `$exception` on the
first-call journey, support contacts, unwanted calls/DNC, top-up refunds.

**E2 — Actionable first-result summary vs the standard confirmation.**
Population: workspaces right after their first verified AI result. Exposure:
`followup_value_summary_viewed`. Primary metric: workspaces with another
distinct `followup_business_result_recorded` within 7 days. Window 7 days;
duration until mature cohorts reach the computed sample. Guardrails: pauses
(`followup_control_applied`), notification fatigue (dismissals), cost per
result, unwanted calls.

## Later products (prepared, not enabled)

| Product                    | Configuration and acceptance before enabling                                                                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surveys                    | One optional question after a blocker ("What stopped you?", bounded answers) and one after a period of use; frequency limit (once per 30 days); never during a call; no contact data.                                                                       |
| Session Replay             | Sampled (proposal 20 %) on the follow-up review and onboarding screens only, after masking is validated on sample recordings; inputs and text masked; no network bodies, console, canvas or audio; excluded from call, contact-detail and payment surfaces. |
| Feature Flags, Experiments | Flags `native_followup_rollout_v1` (backend admission, never authorization) and `followup_onboarding_v1` (UX); exposure = the screen shown, not a flag fetch; E1/E2 above. Enable `advanced_disable_flags: false` only then.                                |
| AI Observability           | Latency, tokens/minutes consumed and tool outcomes Ringee observes on its side (agent calls, tool webhooks); no transcript or audio content.                                                                                                                |
| Playground                 | Synthetic scenarios only (fake contacts and calendars); never production data.                                                                                                                                                                              |

Before each: inspect the emitted payloads in a staging project, then enable.
