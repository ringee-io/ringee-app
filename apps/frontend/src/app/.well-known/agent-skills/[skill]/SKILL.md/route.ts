import { notFound } from 'next/navigation';

import { WELL_KNOWN_SKILLS, skillResponse } from '@/features/marketing/skills';

/**
 * `/.well-known/agent-skills/<name>/SKILL.md` — one focused skill, verbatim.
 *
 * Only the names listed in the discovery index resolve; `dynamicParams = false`
 * turns anything else into the 404 the spec requires for missing artifacts.
 * The entry skill is deliberately absent here — it is served at `/SKILL.md`,
 * which is the URL the index advertises for it.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return WELL_KNOWN_SKILLS.map((skill) => ({ skill: skill.name }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ skill: string }> }
) {
  const { skill: name } = await params;
  const skill = WELL_KNOWN_SKILLS.find((candidate) => candidate.name === name);

  if (!skill) notFound();

  return skillResponse(skill);
}
