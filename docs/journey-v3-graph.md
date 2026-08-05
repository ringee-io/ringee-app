# Journey v3 — Graph / Skill-Tree

**Status:** IMPLEMENTED as program version `2026.09`.

This document describes what was built. It supersedes the *presentation and
progression* model of `docs/journey-v2.md`; the v2 backend architecture — real
usage metrics, persisted achievements, transactional idempotent claims, integer
cents, ledger reconciliation, anti-fraud scoring, budgets and workspace caps,
rollout/holdout cohorts, dry-run and manual review, post-commit analytics,
admin-only access, i18n and feature flags — is kept in full.

---

## 1. What changed, what did not

| Layer | v2 | v3 |
|---|---|---|
| Metric bag | 36 measured keys | **unchanged** + 3 new inbound keys |
| `JourneyStageAchievement` | keyed by opaque `stageId` | **unchanged** — `stageId` now holds a node id |
| `JourneyRewardClaim`, risk, budget, rollout, holdout, dry-run, review queue | | **unchanged** |
| `@OrgAdminOnly()` on every route | | **unchanged** |
| Program definition | `ladders: Record<workspaceType, StageDef[]>` with `order` | `tracks` + `nodes` + `policy` |
| Progression | one global linear order | dependency DAG; only Core is required |
| Claim eligibility | `order - 1` predecessor achieved | **every** `dependsOn` achieved |
| UI | vertical list of stage cards | track-columned graph + node drawer |

No migration was run. `stageId` was already an opaque string keyed by
`(workspace, programVersion, stageId)`, so v2 rows keep their exact meaning and
are read through the supersession lens in §5.

---

## 2. Model

Two orthogonal concepts, deliberately not merged into one flag:

- **Track mode** (`required` | `elective`) — must this whole track be done?
- **Node `optional`** — is this node a *bonus inside* its track?

v2 had a single notion of "next" and could not express "Integrations is
elective, but if you do it, CRM is not the only way".

```ts
interface JourneyTrackDef {
  id: JourneyTrackId;
  order: number;                       // graph column
  appliesTo: readonly JourneyWorkspaceType[];
  mode: 'required' | 'elective';
  completion: JourneyTrackCompletionRule;
}

type JourneyTrackCompletionRule =
  | { type: 'capstone'; nodeId: string }
  | { type: 'all'; nodeIds: readonly string[] }
  | { type: 'minimum'; nodeIds: readonly string[]; minimum: number }
  | { type: 'combined'; allOf?; anyOf?; minimumAnyOf? };

interface JourneyCompletionPolicy {
  requiredTrackIds: Record<JourneyWorkspaceType, readonly JourneyTrackId[]>;
  minimumElectiveTracks: Record<JourneyWorkspaceType, number>;
}
```

**Completion policy as shipped:**

```ts
requiredTrackIds     = { personal: ['core'],  organization: ['core'] };
minimumElectiveTracks = { personal: 2,        organization: 3 };
```

A workspace finishes the Journey when Core is complete **and** the minimum
number of applicable elective tracks is complete. Different workspaces finish by
completing entirely different tracks, and that is the point.

Journey completion is separate from node achievements, rewards earned, total
possible rewards and bonus nodes. A workspace can be complete with credit
unclaimed, and can have claimed every cent of two tracks without being complete.

**Node status:** `achieved` | `in_progress` | `available` | `locked`.
`optional` is a separate property, not a status. Internally and in the API the
term is `achieved`; user-facing copy says "Completed".

---

## 3. Tracks

| Track | Mode | Applies to | Completion rule |
|---|---|---|---|
| **Core Calling** | required | both | capstone `core.scale` |
| **Team** | elective | organization | capstone `team.coverage` |
| **Campaigns** | elective | organization | capstone `campaigns.repeatable` |
| **Integrations** | elective | both | `integrations.connected` **+ any 2** of crm/calendar/enrichment/custom |
| **AI** | elective | both | capstone `ai.insights` |
| **Automation** | elective | both | capstone `automation.breadth` |
| **Inbound** | elective | both | `inbound.routing` **+ any 1** of desk_phones/recovery |

Colours reuse the existing dashboard accents: core=sky, team=violet,
campaigns=amber, integrations=orange, ai=fuchsia, automation=emerald,
inbound=teal.

---

## 4. Nodes

27 nodes; a personal workspace sees 20. `P`/`O` are reward cents per workspace
type. `opt` marks a bonus node inside its track.

### Core Calling — required
| id | requirements | depends on | opt | P | O |
|---|---|---|---|---|---|
| `core.setup` | `verifiedPhone≥1`, `dialableNumbers≥1` | — (root) | no | 0 | 0 |
| `core.first_call` | `connectedCalls≥1` | `core.setup` | no | 0 | 0 |
| `core.rhythm` | `connectedCalls≥15`, `activeDays≥4`, `uniqueDestinations≥10`, `connectedMinutes≥20` | `core.first_call` | no | 300 | 200 |
| `core.discipline` | `outcomesLogged≥10`, `meaningfulConversations≥10` | `core.rhythm` | no | 200 | 150 |
| `core.scale` | `connectedCalls≥60`, `activeWeeks≥3`, `meaningfulConversations≥25` | `core.discipline` | no | 250 | 150 |

### Team — elective, organization only
| id | requirements | depends on | opt | P | O |
|---|---|---|---|---|---|
| `team.joined` | `acceptedMembers≥2` | `core.first_call` | no | — | 200 |
| `team.calling` | `activeMembers≥2`, `connectedCalls≥25`, `activeDays≥5` | `team.joined` | no | — | 300 |
| `team.coverage` | `activeMembers≥3`, `activeWeeks≥4` | `team.calling` | no | — | 200 |

### Campaigns — elective, organization only
May depend on Team (it is an org-level outbound-team workflow); nothing outside
Campaigns depends on Campaigns.

| id | requirements | depends on | opt | P | O |
|---|---|---|---|---|---|
| `campaigns.first` | `campaignConnectedCalls≥25`, `campaignUniqueDestinations≥15`, `campaignActiveDays≥3` | `core.rhythm`, `team.calling` | no | — | 300 |
| `campaigns.pipeline` | `workedLeads≥20`, `outcomesLogged≥15` | `campaigns.first` | no | — | 150 |
| `campaigns.repeatable` | `campaignsWithRealActivity≥2` | `campaigns.pipeline` | no | — | 300 |

### Integrations — elective
CRM is **one** valid path, not the path. Every capability node hangs directly
off Core, and the roll-up counts successes from whichever mix is actually used.

| id | requirements | depends on | opt | P | O |
|---|---|---|---|---|---|
| `integrations.crm` | `crmSyncedCalls≥5` | `core.discipline` | no | 150 | 150 |
| `integrations.calendar` | `meetingsSynced≥2` | `core.discipline` | no | 0 | 0 |
| `integrations.enrichment` | `enrichmentImports≥10` | `core.rhythm` | no | 0 | 0 |
| `integrations.custom` | `customIntegrationDeliveries≥5` | `core.discipline` | no | 0 | 0 |
| `integrations.connected` | `integrationSuccesses≥15` | `core.discipline` | no | 200 | 200 |

### AI — elective
| id | requirements | depends on | opt | P | O |
|---|---|---|---|---|---|
| `ai.transcription` | `transcriptionsCompleted≥10` | `core.discipline` | no | 150 | 100 |
| `ai.insights` | `aiResultsProduced≥1` | `ai.transcription` | no | 250 | 250 |
| `ai.team_adoption` | `aiMembersCovered≥2`, `aiResultsProduced≥2`, `transcriptionsCompleted≥25` | `ai.insights` | **yes** | — | 300 |

`ai.team_adoption` is a bonus node and is **not** needed to complete the AI
track — a two-person team should not be blocked on team-wide coverage.

### Automation — elective
`automation.breadth` hangs off `core.scale`, not off agents, so a workspace that
automates with callbacks, rotation and sessions finishes the track without ever
touching MCP.

| id | requirements | depends on | opt | P | O |
|---|---|---|---|---|---|
| `automation.callbacks` | `callbacksWorked≥5` | `core.discipline` | **yes** | 100 | 100 |
| `automation.rotation` | `rotationCallerIdsUsed≥2` | `core.rhythm` | **yes** | 0 | 0 |
| `automation.sessions` | `callSessionCalls≥5` | `core.rhythm` | **yes** | 0 | 0 |
| `automation.agents` | `mcpCalls≥5`, `mcpSessions≥1` | `core.discipline` | **yes** | 200 | 300 |
| `automation.breadth` | `advancedCapabilitiesUsed≥3` | `core.scale` | no | 200 | 350 |

### Inbound — elective, fully non-blocking
No node outside this track may name an inbound node in `dependsOn`.

| id | requirements | depends on | opt | P | O |
|---|---|---|---|---|---|
| `inbound.routing` | `inboundCallsAnswered≥1` | `core.setup` | no | 0 | 0 |
| `inbound.desk_phones` | `inboundSipDeviceCalls≥5` | `inbound.routing` | no | 0 | 0 |
| `inbound.recovery` | `inboundMissedFollowedUp≥5` | `inbound.routing` | no | 0 | 0 |

`callbacksWorked`, `mcpSessions`, `rotationCallerIdsUsed`, `callSessionCalls`,
`enrichmentImports` and `customIntegrationDeliveries` were all measured in v2 and
used by **no stage**. The graph is what finally puts them to work.

### Invariants (build-time, `journey.program.spec.ts`)

- **A** — every `dependsOn` resolves; the graph is acyclic; every node renders
  strictly below its dependencies.
- **B** — no non-optional node depends on an optional one; no completion rule
  names an optional node; the `optional` flag is *derived* from the track's
  completion path and compared, so it cannot drift.
- **C** — applicability closure: a node never depends on one its workspace type
  cannot see; every completion rule is satisfiable.
- **D** — Inbound is never depended on from outside its track, never named by
  another track's rule, never in `requiredTrackIds`, and enough other electives
  exist to finish without it.
- **E** — reward exposure is frozen: **exactly** 2000 cents personal / 3700
  cents organization, and every capability node v3 introduced pays zero.

### Reward policy

Financial exposure did **not** increase. Totals are identical to v2 to the cent
($20.00 personal / $37.00 organization), and `JOURNEY_MAX_TOTAL_CENTS_PER_WORKSPACE`
is unchanged at 4000. All eight capability nodes v3 introduced (calendar,
enrichment, custom, rotation, sessions, and the three inbound nodes) pay 0 —
they still grant achievements, visual completion and track progress. No XP or
points economy was added.

---

## 5. Legacy v2 achievements and claims

Shipped as a new version. `2026.08` was **not** mutated, and no achievement or
claim was migrated or deleted. `getJourneyProgram('2026.08')` now throws an
actionable message rather than serving a ladder the evaluator cannot run.

```ts
interface JourneyLegacySupersession {
  legacyProgramVersion: string;
  legacyStageId: string;
  achievementNodeIds: readonly string[];  // progress fans out
  rewardNodeId?: string;                  // money does not
}
```

`projectLegacyCredit()` returns three things:

| bucket | meaning |
|---|---|
| `achievedAt` | nodes to treat as achieved, at the **real** legacy timestamp |
| `alreadyPaid` | the one node whose reward the legacy claim settled |
| `rewardCoveredByLegacy` | the other fan-out nodes of a **paid** legacy stage |

The third bucket is the one that matters. A v2 rung often maps to several v3
nodes (`ai_closer` → `ai.transcription` + `ai.insights`) and the fan-out has to
be complete or the dependency chain breaks and the node renders locked forever.
But if a sibling carried its own v3 reward it would be paid a second time for
work v2 already bought. So paid siblings are marked covered, and
`journey.legacy.spec.ts` asserts that **no paid node escapes one of the two
buckets**.

Rules enforced by tests: a `claimed` legacy claim is the only status that blocks;
pending / rejected / revoked never block; timestamps are never synthesised;
inputs are never mutated; repeated calls are identical.

The API reports these as `legacy_claimed`, and the UI renders "Already
redeemed — you redeemed this under the previous Journey program" instead of a
claim button that would be guaranteed to fail.

---

## 6. Inbound metrics

Three new metrics in `journey.repository.ts`, verified against real PostgreSQL
(`journey.repository.inbound.spec.ts`, 20 tests).

`ORIGIN_SQL` normalises `fromNumber`, not `toNumber` — inbound inverts the
geometry, and reusing the outbound helper would make every inbound call look
self-dialled.

**`inboundCallsAnswered`** — `direction='inbound'`, `answeredAt` and `endedAt`
not null, `providerCallId` present, duration ≥ `minConnectedSeconds`, outcome not
in (`no_answer`, `voicemail`, `wrong_number`), origin not an owned number and not
a configured QA destination.

**`inboundSipDeviceCalls`** — all of the above **plus `sipDeviceId IS NOT NULL`**.
Deliberately not the generic `sipDeviceCalls` metric, which counts *outbound*
legs placed from a desk phone.

**`inboundMissedFollowedUp`** — a missed inbound call (unanswered, corroborated,
not pending) matched to a later outbound call to the same normalised number that
genuinely connected, within 48 hours. Matching is **one-to-one**:
`DISTINCT ON (missed_id)` picks the earliest eligible callback per missed call,
then `DISTINCT ON (callback_id)` stops one return call from redeeming a whole
afternoon of missed ones. Tests cover the 48-hour boundary either side,
never-returned, non-connecting callbacks, callbacks placed *before* the missed
call, three-missed-one-callback, one-missed-three-callbacks, QA numbers and
self-dials.

---

## 7. UI

CSS positioning for nodes plus one absolutely-positioned SVG layer for edges. No
draggable canvas, no physics, no persisted viewport — the graph is authored and
read-only, so a canvas library would add weight and take the nodes out of the tab
order for nothing.

**Layout is derived** (`lib/graph-layout.ts`): column = track order, row =
dependency depth. Hidden tracks are removed and the columns re-indexed densely,
so a personal workspace never sees empty Team or Campaigns columns. Rows are
compacted the same way. Pure function → server and client render identically.

### 7.1 The map is radial, and it has one node per track

The column grid drew all 27 program steps. It was honest and unreadable: 1416px
of boxes where the only way to learn what any of them wanted was to click it.
Two changes replaced it.

**The workspace is the centre.** `components/journey-hub.tsx` renders the
organization's own logo (or the person's avatar, from Clerk) inside a completion
ring, and every track leaves it as a coloured thread. Distance from the centre is
dependency depth. The point of the shape is that the map is legibly *yours*.

**A map node is a thread, not a step** (`lib/threads.ts`). Seven decisions —
*is this how I sell?* — fit on one screen (584×558 for an organization, 492×461
for a personal workspace); twenty-seven did not. Each node carries the track's
name, the money still unpaid in it, and "2 of 5 steps". The steps did not
disappear: they are the checklist inside the drawer, which is where "what does
this take" belongs. `lib/threads.ts` only **aggregates** — a thread is complete
when the server says its track is, and locked when the server says every step is.
Nothing there invents a rule; if one is ever needed, it belongs in the service.

**The drawer is now the whole answer** (`components/thread-detail.tsx`): what the
track is for, what it pays, then every step with every requirement's real target
and current value, its own reward and its own claim button. Achieved steps
collapse to one line. The old track bar is gone — it listed the same seven names
the map now shows.

**Geometry** (`lib/graph-layout.ts`) is pure and parameterised by a metric set
(comfortable `132×116`, compact `108×104`, chosen by a `ResizeObserver` on the
map's own container, because collapsing the sidebar changes the room available
without the viewport moving). Sector width follows a track's fan-out; ring radius
is solved once per level for **all** threads from the chord that a node needs at
that radius (`chord / 2·sin(slice/2)`), then forced monotonic. Both rules exist
because their absence was visible: per-track radii put two rings of the same
thread at the same distance, and arc-length instead of the chord let neighbouring
sectors overlap near the hub. Node names wrap to two lines rather than
truncating — a third of them do not fit on one line in either language — and the
optional hexagon's point is a shallow 12% so the clip path cannot eat the icon.

**Node states**: completed (filled track accent, check, solid ring) · in progress
(track-tinted icon + animated progress bar) · available (card, dashed edges in)
· locked (muted, lock glyph, dashed incoming edges at 30% opacity) · optional
(hexagonal clip-path **plus** an explicit "Optional" label and
`aria-describedby` — shape and colour are never the only signal).

Only the single server-recommended node has an idle glow (`journey-pulse`, 3s,
6% opacity). Everything is behind `prefers-reduced-motion`. Confetti stays where
it was: one node, once, server-persisted.

**Page**: summary header → track bar → graph → drawer. The separate capabilities
panel is gone; those capabilities are graph nodes now.

**Recommendation** is entirely server-side, in priority order: Core while
unfinished → in-progress over untouched → tracks with existing activity →
closeness to completing a track → zero-reward bonus nodes **excluded outright**
while a completion path is open → closeness to done. (The exclusion is a hard
filter, not a penalty; as a penalty the `in_progress` bonus outweighed it.)

**Drawer** — desktop: Radix `Dialog` with `modal={false}` and **no overlay**. No
scroll lock, no focus trap; the graph stays visible and clickable, and clicking
another node swaps the contents. Width `min(440px, 38vw)`. `?node=<id>` URL
state, Escape/X close, focus restored to the originating node manually (non-modal
Radix does not manage focus).

**Drawer** — mobile (`<768px`): `vaul` bottom sheet, snap points 55%/96%, drag
handle, sticky footer with `env(safe-area-inset-bottom)`, Android Back closes via
URL state.

Contents, in order: icon · title · track · status · optional badge · reward ·
claim state · why it matters · requirement checklist with progress · depends on ·
unlocks · primary CTA · tip. Depends-on and unlocks are clickable and re-target
the drawer. A locked node names its **actual** blockers ("Complete Calling
rhythm first"), each clickable — never "Complete the previous step first", which
a graph cannot honestly say. An i18n test bans that phrase from the copy.

**Accessibility**: nodes are real `<button>`s in the tab order; arrow keys move
within a track, `[`/`]` between tracks; the SVG layer is `pointer-events-none`
and `aria-hidden` with a `sr-only` nested-list equivalent of the whole graph,
because absolute positioning cannot convey "columns are tracks, rows are depth".

---

## 8. Fixes carried in

1. **Five dead CTA routes.** v2 linked `/dashboard/numbers`,
   `/dashboard/organization`, `/dashboard/integrations`, `/dashboard/ai-pipelines`
   and `/dashboard/settings/recording` — none existed. All 22 action keys now
   resolve, and `journey.routes.spec.ts` checks the map against the real App
   Router tree (including route groups and catch-all segments).
2. **`/dashboard/settings/team`** created, because `invite_team` had nowhere to
   go. It renders Clerk's `OrganizationProfile` rather than a second invitation
   system — Ringee receives membership through the Clerk webhook and does not own
   it, so a bespoke invite form would be a second writer to a record this app
   only reads.
3. **`claimAll` rate-limited itself.** It called the per-node limit in a loop
   against `JOURNEY_CLAIM_MAX_PER_USER` (default 10); with up to 25 rewarded
   nodes a legitimate "Redeem all" cut off partway and stranded money. Now:
   authenticate → **one** batch check (`checkBatchRateLimit`, its own counters) →
   evaluate metrics **once** → persist achievements → walk eligible nodes in
   dependency order → per-node idempotency key, risk decision and transaction →
   aggregate result.

---

## 9. Analytics

Closed typed payload, no raw user/workspace/email/phone. Added
`journey_node_viewed` (client, node id validated server-side against the program
before recording) and `journey_track_completed` (server, fired once per track via
a Redis marker). `journey_completed` fires once and carries
`electiveTracksCompleted` and `completionPath` — the ordered list of tracks the
workspace actually finished, which is the only way to tell elective paths apart
in the funnel. Server events are emitted after commit.

---

## 10. Configuration

`JOURNEY_PROGRAM_VERSION` now defaults to `2026.09`. Everything else is
unchanged. Pointing it back at `2026.08` is a configuration error and fails fast
with a message naming the supersession map.
