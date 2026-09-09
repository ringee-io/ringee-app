import {
  CHROME_EXTENSION_URL,
  CLI_NPM_URL,
  DOCS_API_URL,
  DOCS_MCP_URL,
  DOCS_URL,
  GITHUB_URL,
  PRICING,
  SDK_NPM_URL,
  SITE_LAST_MODIFIED,
  SITE_URL
} from '../site';
import { PUBLISHED_SKILLS } from './skills.generated';
import { FEATURES } from './features';
import { INTEGRATION_CATEGORIES, INTEGRATIONS } from './integrations';
import { USE_CASES } from './use-cases';

/**
 * The machine rendering of the marketing site: what `/machine` shows and what
 * `/machine.md` serves.
 *
 * Everything here is derived from the same content modules that render the
 * human pages — features, integrations, use cases, pricing — so the two
 * renderings cannot drift apart. Only the facts that live nowhere else (the
 * shape of the tool surface, the constraints an agent has to plan around) are
 * written down, and each of those names where it is enforced.
 *
 * Keep this module framework-agnostic (no React): it is imported by the page
 * and by the `/machine.md` route handler.
 */

/** Canonical path of the generated claims document. */
export const MACHINE_MD_PATH = '/machine.md';

/* ------------------------------------------------------------------ */
/* the agent session                                                   */
/* ------------------------------------------------------------------ */

/**
 * How a transcript line is coloured. `human` is the one line in the replay
 * that is not a call — Ringee's whole position is that the conversation stays
 * a person's, so it gets its own mark.
 */
export type SessionLineKind =
  | 'cmd'
  | 'out'
  | 'ok'
  | 'tool'
  | 'note'
  | 'human'
  | 'done';

export type SessionLine = { kind: SessionLineKind; text: string };

const SKILL_NAMES = PUBLISHED_SKILLS.map((skill) => skill.name).join(', ');

/**
 * The tool surface, as catalogued in `packages/agent/src/tools/catalog.ts`
 * (the source of truth — these counts mirror it, they do not define it).
 */
export const TOOL_SURFACE = {
  total: 37,
  read: 19,
  write: 10,
  sensitive: 4,
  destructive: 4
} as const;

/**
 * A replay of the outbound loop as an agent runs it: discover the site, install
 * the skills, connect the MCP, prospect, queue the call, then log what happened.
 *
 * Tool names and argument keys are the real ones (`packages/agent/src/schemas`);
 * ids and provider results are elided with `…` because they belong to a
 * workspace, not to a marketing page.
 */
export const AGENT_SESSION: readonly SessionLine[] = [
  { kind: 'cmd', text: `$ curl -s ${SITE_URL}/llms.txt` },
  { kind: 'out', text: '# Ringee' },
  {
    kind: 'out',
    text: '> Ringee is low-cost, pay-as-you-go outbound calling software built for the AI era.'
  },
  { kind: 'out', text: '## Key facts' },
  { kind: 'cmd', text: `$ npx skills add ${SITE_URL}` },
  {
    kind: 'ok',
    text: `✓ ${PUBLISHED_SKILLS.length} skills · ${SKILL_NAMES}`
  },
  {
    kind: 'note',
    text: '// discovery index: /.well-known/agent-skills/index.json · entry skill: /SKILL.md'
  },
  {
    kind: 'cmd',
    text: '$ claude mcp add --transport sse ringee "$RINGEE_MCP_URL"'
  },
  {
    kind: 'ok',
    text: `✓ connected · ${TOOL_SURFACE.total} tools · ${TOOL_SURFACE.read} read · ${TOOL_SURFACE.write} write · ${TOOL_SURFACE.sensitive} sensitive · ${TOOL_SURFACE.destructive} destructive`
  },
  {
    kind: 'note',
    text: '// the URL is the credential: minted in the dashboard, bound to one workspace, never guessed'
  },
  { kind: 'note', text: '// tools run inside the session, not in the shell' },
  {
    kind: 'tool',
    text: 'search_leads {"jobTitles":["VP Sales"],"personCountries":["Spain"],"industries":["fintech"],"hasPhone":true}'
  },
  {
    kind: 'out',
    text: '{"jobId":"…","provider":"apollo","candidates":[{"externalId":"…","name":"…","company":"…"}]}'
  },
  {
    kind: 'tool',
    text: 'reveal_lead {"jobId":"…","externalId":"…","revealPhone":true}'
  },
  {
    kind: 'note',
    text: '// spends provider credits — the skill stops and asks a person before this one'
  },
  { kind: 'out', text: '{"email":"…","phoneNumber":"+34 6·· ··· ···"}' },
  {
    kind: 'tool',
    text: 'import_leads_as_contacts {"jobId":"…","externalIds":["…"]}'
  },
  { kind: 'out', text: '{"imported":1,"skippedDuplicatePhone":0}' },
  {
    kind: 'tool',
    text: 'create_call_session {"title":"Tuesday outbound","contacts":[{"contactId":"…"}]}'
  },
  {
    kind: 'out',
    text: `{"callSessionId":"…","joinUrl":"${SITE_URL}/dialer/session?token=…"}`
  },
  {
    kind: 'note',
    text: '// the token is returned once and cannot be re-fetched'
  },
  {
    kind: 'human',
    text: '▸ a person opens the link and has the conversation. this step has no endpoint.'
  },
  {
    kind: 'tool',
    text: 'log_call_outcome {"callId":"…","outcome":"meeting_booked","outcomeNote":"Demo Friday"}'
  },
  {
    kind: 'tool',
    text: 'schedule_meeting {"contactId":"…","scheduledAt":"2026-09-16T10:00:00+02:00","callId":"…"}'
  },
  {
    kind: 'out',
    text: '{"meetingId":"…","calendarProvider":"google","status":"scheduled"}'
  },
  {
    kind: 'done',
    text: '# 6 tools · 1 vendor · humans involved: 1 — the one on the call. that is the product.'
  }
];

/* ------------------------------------------------------------------ */
/* the machine-readable surfaces                                       */
/* ------------------------------------------------------------------ */

export type MachineSurface = {
  label: string;
  href: string;
  blurb: string;
  /** Off-site (npm, GitHub, docs) rather than a path on this domain. */
  external?: boolean;
};

/** Every artifact an agent can read without an account. */
export const MACHINE_SURFACES: readonly MachineSurface[] = [
  {
    label: '/llms.txt',
    href: '/llms.txt',
    blurb: 'The index: what Ringee is, and every page worth reading.'
  },
  {
    label: '/llms-full.txt',
    href: '/llms-full.txt',
    blurb: 'The long form: facts, pricing, limits, in one document.'
  },
  {
    label: MACHINE_MD_PATH,
    href: MACHINE_MD_PATH,
    blurb: 'The claims below, as bytes. Generated from this page’s objects.'
  },
  {
    label: '/SKILL.md',
    href: '/SKILL.md',
    blurb: 'The entry skill — how to drive Ringee, safety rules included.'
  },
  {
    label: '/.well-known/agent-skills/index.json',
    href: '/.well-known/agent-skills/index.json',
    blurb: `Discovery index for all ${PUBLISHED_SKILLS.length} skills, per the Agent Skills spec.`
  },
  {
    label: '/robots.txt',
    href: '/robots.txt',
    blurb: 'Every major AI crawler allowed: search, retrieval and training.'
  },
  {
    label: 'MCP server',
    href: DOCS_MCP_URL,
    blurb: `${TOOL_SURFACE.total} tools over SSE. The URL is minted per workspace.`,
    external: true
  },
  {
    label: 'REST API',
    href: DOCS_API_URL,
    blurb: 'The same operations, for anything that is not an agent.',
    external: true
  }
];

/* ------------------------------------------------------------------ */
/* the claims document                                                 */
/* ------------------------------------------------------------------ */

/**
 * Facts that are not derivable from the content modules. Each one is either
 * public elsewhere on the site (`llms.txt`, `/pricing`, `/security`) or an
 * invariant of the system, and the limits are stated as plainly as the wins —
 * an agent evaluating Ringee should be able to rule it out from this document.
 */
const CLAIMS: string[] = [
  'category: open-source, pay-as-you-go outbound calling software',
  `pricing: ${PRICING.freelancer.name} $${PRICING.freelancer.price}/${PRICING.freelancer.period} · ${PRICING.organization.name} $${PRICING.organization.price}/${PRICING.organization.period} per organization, unlimited members`,
  'calling: pay-as-you-go credits from $0.012/min, billed separately from the plan',
  'seats: none. team price is flat, not per user',
  'surfaces: web app, Chrome extension, iOS and Android apps, CLI, Dialer SDK, MCP',
  'transcription: real time, works with or without recording',
  'licence: MIT, self-hostable',
  'certifications: none claimed. Ringee has not completed SOC 2 or ISO',
  'humans: agents prepare the work; a person takes the call'
];

/**
 * Constraints an agent has to plan around, each named where it is enforced.
 * These are the reasons a plan fails, so they are worth as much as the claims.
 */
const CONSTRAINTS: string[] = [
  'one call at a time per user — a second dial is refused with 409',
  'credit spend is idempotent and requires a reference; a retry never double-charges',
  'every read and write is scoped to one workspace (personal or organization)',
  'revealing a lead spends provider credits and asks for confirmation first',
  'a call session magic link returns its token once; it cannot be re-fetched',
  'deleting a contact requires the stored phone number as a second confirmation',
  'phone numbers are E.164; datetimes are ISO-8601 with an offset'
];

const line = (label: string, value: string) => `- ${label}: ${value}`;

/**
 * Builds the claims document. Same objects as the human page, rendered as
 * Markdown instead of React — that is the entire trick, and it is why the two
 * renderings agree by construction rather than by discipline.
 */
export function buildClaimsDocument(): string {
  const sections: string[] = [];

  sections.push(
    [
      '# Ringee',
      '',
      '> Low-cost, pay-as-you-go outbound calling software. Agents prospect, queue and follow up; a person makes the call.',
      '',
      `source: ${SITE_URL}${MACHINE_MD_PATH}`,
      `human rendering: ${SITE_URL}/`,
      `generated: ${SITE_LAST_MODIFIED}`
    ].join('\n')
  );

  sections.push(['## Claims', '', ...CLAIMS.map((c) => `- ${c}`)].join('\n'));

  sections.push(
    [
      '## Interfaces',
      '',
      line('mcp', `SSE, ${TOOL_SURFACE.total} tools — ${DOCS_MCP_URL}`),
      line('rest api', DOCS_API_URL),
      line('cli', `npx ringee — ${CLI_NPM_URL}`),
      line('dialer sdk', `@ringee/dialer-sdk — ${SDK_NPM_URL}`),
      line('chrome extension', CHROME_EXTENSION_URL),
      line('docs', DOCS_URL),
      line('source', GITHUB_URL)
    ].join('\n')
  );

  sections.push(
    [
      `## Tool surface (${TOOL_SURFACE.total})`,
      '',
      line('read', String(TOOL_SURFACE.read)),
      line('write', String(TOOL_SURFACE.write)),
      line(
        'sensitive (spends credits or mints access)',
        String(TOOL_SURFACE.sensitive)
      ),
      line('destructive (double-confirmed)', String(TOOL_SURFACE.destructive)),
      '',
      `Skills that drive them: ${SKILL_NAMES}.`
    ].join('\n')
  );

  sections.push(
    [
      `## Features (${FEATURES.length})`,
      '',
      ...FEATURES.map(
        (feature) =>
          `- ${feature.name} · ${feature.category}: ${feature.tagline} → ${SITE_URL}/features/${feature.slug}`
      )
    ].join('\n')
  );

  sections.push(
    [
      `## Integrations (${INTEGRATIONS.length})`,
      '',
      ...INTEGRATION_CATEGORIES.flatMap((category) => [
        `### ${category.name}`,
        ...INTEGRATIONS.filter(
          (integration) => integration.category === category.name
        ).map(
          (integration) =>
            `- ${integration.name}: ${integration.tagline} → ${SITE_URL}/integrations/${integration.slug}`
        ),
        ''
      ])
    ]
      .join('\n')
      .trimEnd()
  );

  sections.push(
    [
      `## Use cases (${USE_CASES.length})`,
      '',
      ...USE_CASES.map(
        (useCase) =>
          `- ${useCase.name}: ${useCase.tagline} → ${SITE_URL}/use-cases/${useCase.slug}`
      )
    ].join('\n')
  );

  sections.push(
    ['## Constraints', '', ...CONSTRAINTS.map((c) => `- ${c}`)].join('\n')
  );

  return `${sections.join('\n\n')}\n`;
}
