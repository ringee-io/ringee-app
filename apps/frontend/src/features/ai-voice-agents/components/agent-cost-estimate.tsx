'use client';

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';

/** Compact pricing context shared by the create and detail screens. */
export function AgentCostEstimate() {
  const t = useTranslations('aiVoiceAgents.pricing');
  const description = `${t('configurationDisclaimer')} ${t('byokDisclaimer')}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          className='text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex cursor-help items-center gap-1.5 rounded-md px-1 py-0.5 text-right text-xs leading-5 transition-colors focus-visible:ring-2 focus-visible:outline-none'
          aria-label={`${t('estimate')}. ${description}`}
        >
          <span>{t('estimate')}</span>
          <Info className='size-3.5 shrink-0' aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side='bottom' className='max-w-80 space-y-2'>
        <p>{t('configurationDisclaimer')}</p>
        <p>{t('byokDisclaimer')}</p>
      </TooltipContent>
    </Tooltip>
  );
}
