import { ENTRY_SKILL, skillResponse } from '@/features/marketing/skills';

/**
 * `/SKILL.md` — the entry point of the published Ringee Agent Skills.
 *
 * An agent that lands on the bare domain reads this to learn what Ringee can do
 * and how to drive it; the discovery index at
 * `/.well-known/agent-skills/index.json` points here for the `ringee` skill and
 * lists the focused ones. Served as a route handler (like `robots.txt`) so the
 * content type, caching and CORS headers the Agent Skills Discovery spec asks
 * for are set explicitly.
 *
 * Prerendered at build time — the body is a static asset, never a request-time
 * read.
 */
export const dynamic = 'force-static';

export function GET() {
  return skillResponse(ENTRY_SKILL);
}
