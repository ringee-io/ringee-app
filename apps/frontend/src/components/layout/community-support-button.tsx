'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { IconBrandLinkedin } from '@tabler/icons-react';

/** LinkedIn group where the Ringee team and community provide support. */
const COMMUNITY_URL = 'https://www.linkedin.com/groups/18738025';

/**
 * Header entry point linking to the Ringee community on LinkedIn, where we
 * answer questions and provide support. Opens in a new tab and explains
 * itself through a tooltip.
 */
export function CommunitySupportButton() {
  const t = useTranslations('navigation.communitySupport');

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            asChild
            variant='link'
            size='sm'
            className='cursor-pointer'
          >
            <a href={COMMUNITY_URL} target='_blank' rel='noopener noreferrer'>
              <IconBrandLinkedin size={15} />
              <span className='hidden text-xs font-semibold sm:inline'>
                {t('label')}
              </span>
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent side='bottom' className='max-w-64'>
          <p className='text-xs font-semibold'>{t('tooltipTitle')}</p>
          <p className='text-primary-foreground/80 mt-1 text-[11px] leading-relaxed font-normal'>
            {t('tooltipDescription')}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
