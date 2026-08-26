import { SITE_URL } from '@/features/marketing/site';
import {
  PUBLISHED_SKILLS,
  type PublishedSkill
} from '@/features/marketing/content/skills.generated';

/**
 * Public distribution of the Ringee Agent Skills.
 *
 * Ringee is driven by agents, so the skills that teach an agent how to operate
 * it are published on the marketing site the same way `robots.txt`, `llms.txt`
 * and the sitemap are — as machine-readable artifacts at stable URLs:
 *
 *   /SKILL.md                                  the umbrella skill (entry point)
 *   /.well-known/skills/default/skill.md       same bytes, well-known location
 *   /.well-known/agent-skills/index.json       discovery index of every skill
 *   /.well-known/agent-skills/<name>/SKILL.md  one skill, verbatim
 *
 * The index follows the Agent Skills Discovery specification
 * (https://github.com/cloudflare/agent-skills-discovery-rfc), which is what lets
 * a client install everything from the bare site URL — `npx skills add
 * https://www.ringee.io`. `/SKILL.md` is the convenience alias that a human (or
 * an agent that guesses) can reach without knowing the spec.
 *
 * Bodies come from `skills.generated.ts`, generated out of
 * `packages/agent/skills` — the same files that ship in the Claude Code plugin
 * and the claude.ai skill zips. Never hand-edit a skill here.
 */

export type { PublishedSkill };

/** JSON Schema the discovery index conforms to. */
const DISCOVERY_SCHEMA =
  'https://schemas.agentskills.io/discovery/0.2.0/schema.json';

/**
 * The umbrella skill. It is the one served at `/SKILL.md`, so it has to orient
 * an agent that arrives knowing nothing but the domain. The generator
 * guarantees it exists, so the non-null assertion cannot fire at runtime.
 */
export const ENTRY_SKILL: PublishedSkill = PUBLISHED_SKILLS.find(
  (skill) => skill.name === 'ringee'
)!;

/** Canonical path of the entry skill. */
export const SKILL_MD_PATH = '/SKILL.md';
/** Discovery index listing every published skill. */
export const SKILLS_INDEX_PATH = '/.well-known/agent-skills/index.json';

/**
 * Where a given skill is served. The entry skill lives at the root alias so the
 * two URLs never disagree about which bytes are canonical.
 */
export function skillPath(name: string): string {
  return name === ENTRY_SKILL.name
    ? SKILL_MD_PATH
    : `/.well-known/agent-skills/${name}/SKILL.md`;
}

/** Every skill except the entry one — those served under `.well-known`. */
export const WELL_KNOWN_SKILLS: readonly PublishedSkill[] =
  PUBLISHED_SKILLS.filter((skill) => skill.name !== ENTRY_SKILL.name);

/** The discovery index document, per the Agent Skills Discovery spec. */
export function buildSkillsIndex() {
  return {
    $schema: DISCOVERY_SCHEMA,
    skills: PUBLISHED_SKILLS.map((skill) => ({
      name: skill.name,
      // Every skill is a single self-contained SKILL.md — no bundled scripts,
      // references or assets, so nothing here needs the `archive` type.
      type: 'skill-md' as const,
      description: skill.description,
      url: `${SITE_URL}${skillPath(skill.name)}`,
      digest: skill.digest
    }))
  };
}

/**
 * Shared caching for every skill artifact. Skills change on deploy, not per
 * request, and clients de-duplicate by digest anyway — an hour of freshness
 * with a day of stale-while-revalidate keeps them cheap without going stale.
 */
const CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';

/**
 * The spec asks servers to allow cross-origin reads so browser-based clients can
 * fetch these artifacts. They are public documents, so `*` is the whole policy.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
};

/** Serve a SKILL.md verbatim. */
export function skillResponse(skill: PublishedSkill): Response {
  return new Response(skill.body, {
    headers: {
      // `text/markdown` is what the spec names first; the global `nosniff`
      // header means browsers download rather than render it, which is correct
      // for an artifact meant to be installed rather than read in a tab.
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': CACHE_CONTROL,
      ...CORS
    }
  });
}

/** Serve the discovery index. */
export function skillsIndexResponse(): Response {
  return new Response(`${JSON.stringify(buildSkillsIndex(), null, 2)}\n`, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': CACHE_CONTROL,
      ...CORS
    }
  });
}
