'use client';

import { useTranslations } from 'next-intl';
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
  const t = useTranslations('aiVoiceAgents.company');
  return (
    <Section title={t('title')} hint={t('hint')}>
      <CompanyContextFields
        value={draft.company}
        onChange={draft.setCompany}
        currentAgentId={agentId}
        errors={draft.errors}
      />
    </Section>
  );
}
