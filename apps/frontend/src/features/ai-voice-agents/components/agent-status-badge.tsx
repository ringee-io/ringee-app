'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import type { VoiceAgentStatus } from '../types';

/** Only the shape is fixed here; the word comes from the catalogue. */
const VARIANTS: Record<
  VoiceAgentStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  active: 'default',
  draft: 'secondary',
  disabled: 'outline',
  error: 'destructive'
};

export function AgentStatusBadge({ status }: { status: VoiceAgentStatus }) {
  const t = useTranslations('aiVoiceAgents.status');
  const variant = VARIANTS[status] ?? VARIANTS.draft;
  return <Badge variant={variant}>{t.has(status) ? t(status) : status}</Badge>;
}
