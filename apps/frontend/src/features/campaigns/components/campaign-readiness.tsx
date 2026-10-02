'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Circle, Info } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { Campaign } from '../types/campaign.types';

export type ReadinessTarget = 'leads' | 'team' | 'settings' | 'dispositions';

type ItemState = 'done' | 'todo' | 'info';

function Item({
  state,
  title,
  description,
  action
}: {
  state: ItemState;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const Icon =
    state === 'done' ? CheckCircle2 : state === 'info' ? Info : Circle;
  return (
    <li className='flex items-start gap-3 py-3 first:pt-0 last:pb-0'>
      <Icon
        className={cn(
          'mt-0.5 h-5 w-5 shrink-0',
          state === 'done' && 'text-emerald-500',
          state === 'todo' && 'text-muted-foreground',
          state === 'info' && 'text-sky-500'
        )}
      />
      <div className='min-w-0 flex-1'>
        <p
          className={cn(
            'text-sm font-medium',
            state === 'done' && 'text-muted-foreground'
          )}
        >
          {title}
        </p>
        {description ? (
          <p className='text-muted-foreground mt-0.5 text-xs'>{description}</p>
        ) : null}
      </div>
      {action ? <div className='shrink-0'>{action}</div> : null}
    </li>
  );
}

/**
 * What a draft still needs before it can be activated — the same three checks
 * `transitionStatus` makes on the server (a lead, a disposition, a number to
 * dial from), plus the one that decides who can call it. Each missing item
 * links straight to where it is fixed.
 */
export function CampaignReadiness({
  campaign,
  leadCount,
  dispositionCount,
  memberCount,
  onGoTo
}: {
  campaign: Campaign;
  leadCount: number;
  dispositionCount: number | null;
  memberCount: number | null;
  onGoTo: (target: ReadinessTarget) => void;
}) {
  const t = useTranslations('campaigns.detail.readiness');

  const hasLeads = leadCount > 0;
  const hasDispositions = (dispositionCount ?? 0) > 0;
  const hasNumber = Boolean(
    campaign.externalNumberId ||
      campaign.numberPurchasedId ||
      campaign.callerIdId
  );
  const hasTeam = (memberCount ?? 0) > 0;
  const required = [hasLeads, hasDispositions];
  const readyCount = required.filter(Boolean).length;

  const goTo = (target: ReadinessTarget, label: string) => (
    <Button variant='outline' size='sm' onClick={() => onGoTo(target)}>
      {label}
    </Button>
  );

  return (
    <Card className='py-0'>
      <CardContent className='p-5'>
        <div className='mb-4 flex flex-wrap items-baseline justify-between gap-2'>
          <h2 className='text-base font-semibold'>{t('title')}</h2>
          <span className='text-muted-foreground text-xs'>
            {t('progress', { done: readyCount, total: required.length })}
          </span>
        </div>
        <ul className='divide-border divide-y'>
          <Item
            state={hasLeads ? 'done' : 'todo'}
            title={
              hasLeads ? t('leads.done', { count: leadCount }) : t('leads.todo')
            }
            description={hasLeads ? undefined : t('leads.hint')}
            action={hasLeads ? undefined : goTo('leads', t('leads.action'))}
          />
          <Item
            state={hasDispositions ? 'done' : 'todo'}
            title={
              hasDispositions
                ? t('dispositions.done', { count: dispositionCount ?? 0 })
                : t('dispositions.todo')
            }
            description={hasDispositions ? undefined : t('dispositions.hint')}
            action={
              hasDispositions
                ? undefined
                : goTo('dispositions', t('dispositions.action'))
            }
          />
          <Item
            state={hasNumber ? 'done' : 'info'}
            title={hasNumber ? t('number.done') : t('number.auto')}
            description={hasNumber ? undefined : t('number.hint')}
            action={
              hasNumber ? undefined : goTo('settings', t('number.action'))
            }
          />
          <Item
            state={hasTeam ? 'done' : 'info'}
            title={
              hasTeam
                ? t('team.done', { count: memberCount ?? 0 })
                : t('team.todo')
            }
            description={hasTeam ? undefined : t('team.hint')}
            action={hasTeam ? undefined : goTo('team', t('team.action'))}
          />
        </ul>
      </CardContent>
    </Card>
  );
}

/** Whether the server will accept `draft → active` (see `transitionStatus`). */
export function canActivate(
  leadCount: number,
  dispositionCount: number | null
) {
  return leadCount > 0 && (dispositionCount ?? 0) > 0;
}
