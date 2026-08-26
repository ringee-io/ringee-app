import { skillsIndexResponse } from '@/features/marketing/skills';

/**
 * `/.well-known/agent-skills/index.json` — the Agent Skills Discovery index.
 *
 * Lists every published Ringee skill with its description, URL and sha256
 * digest, so a client can enumerate them from the site URL alone and skip
 * re-downloading the ones it already has.
 */
export const dynamic = 'force-static';

export function GET() {
  return skillsIndexResponse();
}
