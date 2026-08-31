'use client';

import {
  Bot,
  Chrome,
  Globe,
  Megaphone,
  Phone,
  Smartphone,
  Ticket
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useEnumLabels } from '../lib/labels';
import type { CallSource } from '../types';

const SOURCE_ICONS: Record<NonNullable<CallSource>, LucideIcon> = {
  web: Globe,
  chrome_extension: Chrome,
  mobile: Smartphone,
  campaign: Megaphone,
  session: Ticket,
  sip_device: Phone,
  ai_voice_agent: Bot
};

/**
 * Who or what placed the call, in one chip.
 *
 * Shared by the history table and the detail screen so the same call is
 * described the same way in the list and on the page it opens — an AI call in
 * particular has to be recognisable at a glance in a table of hundreds, which
 * is why the agent's own name replaces the generic label when there is one.
 */
export function CallSourceBadge({
  source,
  agentName,
  className
}: {
  source: CallSource;
  /** The agent that placed it. Named agents beat the generic "AI agent". */
  agentName?: string | null;
  className?: string;
}) {
  const t = useTranslations('calls.detail');
  const labels = useEnumLabels();
  const Icon = source ? (SOURCE_ICONS[source] ?? Globe) : Globe;
  const isAgent = source === 'ai_voice_agent';
  const label = isAgent ? (agentName ?? t('aiAgent')) : labels.source(source);

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium',
        isAgent
          ? 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300'
          : 'border-border bg-muted text-muted-foreground',
        className
      )}
      title={isAgent && agentName ? `${t('aiAgent')} · ${agentName}` : label}
    >
      <Icon className='size-3.5 shrink-0' />
      <span className='truncate'>{label}</span>
    </span>
  );
}
