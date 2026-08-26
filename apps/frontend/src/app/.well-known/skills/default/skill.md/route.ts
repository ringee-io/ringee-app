import { ENTRY_SKILL, skillResponse } from '@/features/marketing/skills';

/**
 * `/.well-known/skills/default/skill.md` — the well-known location clients
 * probe when all they have is the site URL. Serves the exact same bytes as
 * `/SKILL.md`, which stays the canonical, human-guessable path.
 */
export const dynamic = 'force-static';

export function GET() {
  return skillResponse(ENTRY_SKILL);
}
