'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { IconSparkles } from '@tabler/icons-react';
import { AI_MODULE_VERSION } from '../constants';

/**
 * Header entry point for the AI Assistant module. Replaces the old sidebar
 * link. Shows a Beta badge and exposes the module version in its tooltip so
 * testers can report against a concrete build.
 */
export function AiAssistantLauncher() {
  const t = useTranslations('ai.launcher');
  const router = useRouter();

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={() => router.push('/dashboard/ai')}
            variant='link'
            size='sm'
            className='cursor-pointer'
          >
            <IconSparkles size={15} />
            <span className='text-xs font-semibold'>{t('label')}</span>
            <span className='bg-primary/15 rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase'>
              {t('beta')}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side='bottom' className='max-w-64'>
          <p className='flex items-center gap-1.5 text-xs font-semibold'>
            {t('tooltipTitle')}
            <span className='bg-primary-foreground/15 rounded px-1 py-0.5 text-[9px] font-bold tracking-wide uppercase'>
              {t('tooltipBeta', { version: AI_MODULE_VERSION })}
            </span>
          </p>
          <p className='text-primary-foreground/80 mt-1 text-[11px] leading-relaxed font-normal'>
            {t('tooltipDescription')}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
