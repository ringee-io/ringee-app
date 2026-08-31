'use client';

import type { AgentDraft } from '../../hooks/use-agent-draft';
import { CompanyContextFields } from '../company-context-fields';
import { Section } from './section';

/** The company this agent speaks for — its own, not the workspace's. */
export function CompanySection({
  draft,
  agentId
}: {
  draft: AgentDraft;
  agentId?: string;
}) {
  return (
    <Section
      title='Company'
      hint='Who this agent says it is calling from. Each agent has its own.'
    >
      <CompanyContextFields
        value={draft.company}
        onChange={draft.setCompany}
        currentAgentId={agentId}
        errors={draft.errors}
      />
    </Section>
  );
}
