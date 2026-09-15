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
 * How a transcript line is coloured. Human-led and AI-led conversations get
 * separate marks because both are first-class operators on the same stack.
 */
export type SessionLineKind =
  | 'cmd'
  | 'out'
  | 'ok'
  | 'tool'
  | 'note'
  | 'human'
  | 'ai'
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
    text: '> Ringee is open calling infrastructure for human teams and AI voice agents.'
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
  { kind: 'out', text: '{"email":"…","phoneNumber":"+346········"}' },
  {
    kind: 'tool',
    text: 'import_leads_as_contacts {"jobId":"…","externalIds":["…"]}'
  },
  { kind: 'out', text: '{"imported":1,"skippedDuplicatePhone":0}' },
  {
    kind: 'note',
    text: '// choose the operator: a teammate or a configured AI voice agent'
  },
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
    text: '▸ human mode: a teammate opens the link and holds the conversation.'
  },
  {
    kind: 'tool',
    text: 'log_call_outcome {"callId":"…","outcome":"meeting_booked","outcomeNote":"Demo Friday"}'
  },
  {
    kind: 'note',
    text: '// or let a Ringee AI voice agent take the conversation'
  },
  {
    kind: 'tool',
    text: 'list_ai_voice_agents {}'
  },
  {
    kind: 'out',
    text: '{"agents":[{"id":"…","name":"Sofia","type":"appointment_booking","status":"active"}]}'
  },
  {
    kind: 'tool',
    text: 'start_ai_voice_agent_call {"agentId":"…","to":"+346········","variables":{"first_name":"…"}}'
  },
  {
    kind: 'note',
    text: '// real billed call — the agent asks a person for confirmation first'
  },
  { kind: 'out', text: '{"callId":"…","status":"pending"}' },
  {
    kind: 'ai',
    text: '▸ AI mode: the voice agent places the call, speaks, uses tools and hangs up.'
  },
  {
    kind: 'tool',
    text: 'get_ai_voice_agent_call {"callId":"…"}'
  },
  {
    kind: 'out',
    text: '{"status":"completed","outcome":"meeting_booked","summary":"…","transcript":"…"}'
  },
  {
    kind: 'done',
    text: '# one calling stack · human and AI operators · shared results'
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
  'category: open-source calling infrastructure for human teams and AI voice agents',
  `pricing: ${PRICING.freelancer.name} $${PRICING.freelancer.price}/${PRICING.freelancer.period} · ${PRICING.organization.name} $${PRICING.organization.price}/${PRICING.organization.period} per organization, unlimited members`,
  'calling: pay-as-you-go credits from $0.012/min, billed separately from the plan',
  'users: unlimited on the $20/month team plan. no per-user fees',
  'surfaces: web app, Chrome extension, iOS and Android apps, CLI, Dialer SDK, MCP',
  'operators: people place calls from Ringee dialers; AI voice agents place calls and hold live conversations',
  'voice-agent jobs: appointment booking and reminders/notifications, with editable instructions and knowledge',
  'voice-agent results: call status, recording, transcript, outcome, summary, optional sentiment and extracted data',
  'shared stack: numbers, workspace credit, call history, recordings, transcripts, outcomes and integration events',
  'transcription: real time, works with or without recording',
  'licence: MIT, self-hostable',
  'certifications: none claimed. Ringee has not completed SOC 2 or ISO'
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
      '> Open calling infrastructure where human teams and AI voice agents place real calls from the same stack.',
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
