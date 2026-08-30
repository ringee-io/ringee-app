'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import type { VoiceAgentStatus } from '../types';

const VARIANTS: Record<
  VoiceAgentStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  active: { label: 'Active', variant: 'default' },
  draft: { label: 'Draft', variant: 'secondary' },
  disabled: { label: 'Disabled', variant: 'outline' },
  error: { label: 'Error', variant: 'destructive' }
};

export function AgentStatusBadge({ status }: { status: VoiceAgentStatus }) {
  const { label, variant } = VARIANTS[status] ?? VARIANTS.draft;
  return <Badge variant={variant}>{label}</Badge>;
}
