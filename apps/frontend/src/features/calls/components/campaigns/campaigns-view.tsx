'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Clock, RotateCw, Target, Users } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { useCallingWindowText } from '@/features/campaigns/lib/calling-window';
import type { Campaign } from '@/features/campaigns/types/campaign.types';
import { AgentSessionDialog } from '@/features/dialer/components/agent-session-dialog';
import { SessionStartCard } from '@/features/dialer/components/session-start-card';
import { useDialerSessionStore } from '@/features/dialer/store/dialer-session.store';
import { useCallCampaigns } from '../../hooks/use.call.campaigns';
import { useCallPageShortcuts } from '../../hooks/use.call.page.shortcuts';
import { useTelnyxStore } from '../../store/telnyx.store';
import { Kbd } from '../my-day/kbd';
import { CampaignPicker } from './campaign-picker';

/** The campaign about to be called: which one, how it dials, and when. */
function CampaignBar({
  campaigns,
  selected,
  onSelect
}: {
  campaigns: Campaign[];
  selected: Campaign;
  onSelect: (campaignId: string) => void;
}) {
  const t = useTranslations('calls.myDay.campaigns');
  const tModes = useTranslations('campaigns.modes');
  const callingWindow = useCallingWindowText();
  const { schedule, timezone } = callingWindow(selected);

  return (
    <section
      aria-label={t('bar')}
      className='bg-card flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border py-2 pr-4 pl-2'
    >
      <CampaignPicker
        campaigns={campaigns}
        selected={selected}
        onSelect={onSelect}
      />
      <span className='text-muted-foreground pl-2 text-[13px] sm:pl-0'>
        {tModes(selected.dialerMode)}
      </span>
      <p className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 pl-2 text-[13px] sm:ml-auto sm:pl-0'>
        <span className='inline-flex items-center gap-1.5'>
          <Users className='size-3.5' />
          {t('leads', { count: selected._count?.leads ?? 0 })}
        </span>
        {schedule ? (
          <span
            className='inline-flex items-center gap-1.5'
            title={t('callingHours')}
          >
            <Clock className='size-3.5' />
            <span className='sr-only'>{t('callingHours')}:</span>
            {schedule} · {timezone}
          </span>
        ) : null}
      </p>
    </section>
  );
}

/** The tab's whole width, for its loading, empty and error states. */
function StateCard({ children }: { children: React.ReactNode }) {
  return (
    <div className='bg-card flex flex-col items-center rounded-xl border px-4 py-12 text-center'>
      {children}
    </div>
  );
}

/**
 * The Call page's Campaigns tab: the campaign about to be called and "Start
 * calling". The press opens its session full screen over the page, already
 * started — the same session the campaign page opens, so calling never
 * navigates away. The campaign a session was last opened with comes back
 * selected next time.
 */
export function CampaignsView() {
  const t = useTranslations('calls.myDay.campaigns');
  const { isOrgAdmin } = useOrgRole();
  const {
    campaigns,
    loading,
    failed,
    refresh,
    selected,
    select,
    rememberSession
  } = useCallCampaigns();
  const lineReady = useTelnyxStore((s) => s.status === 'registered');
  // Kept after the session closes so the dialog can animate out with its
  // campaign still in place.
  const [sessionCampaign, setSessionCampaign] = useState<Campaign | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);

  // Only a session that actually opened makes its campaign the default.
  const openedCampaignId = useDialerSessionStore((s) =>
    s.sessionId ? s.campaignId : null
  );
  useEffect(() => {
    if (openedCampaignId) rememberSession(openedCampaignId);
  }, [openedCampaignId, rememberSession]);

  const startCalling = useCallback(() => {
    if (!selected || !lineReady || sessionOpen) return;
    setSessionCampaign(selected);
    setSessionOpen(true);
  }, [selected, lineReady, sessionOpen]);

  useCallPageShortcuts({ onCallNext: startCalling });

  let body: React.ReactNode;
  if (loading) {
    body = (
      <>
        <Skeleton className='h-[54px] w-full rounded-xl' />
        <Skeleton className='h-72 w-full rounded-xl' />
      </>
    );
  } else if (failed) {
    body = (
      <StateCard>
        <p className='text-sm font-medium'>{t('failedTitle')}</p>
        <Button
          variant='outline'
          size='sm'
          className='mt-3'
          onClick={() => void refresh()}
        >
          <RotateCw />
          {t('retry')}
        </Button>
      </StateCard>
    );
  } else if (!selected) {
    body = (
      <StateCard>
        <Target className='text-muted-foreground mb-3 size-9' />
        <p className='text-sm font-semibold'>{t('emptyTitle')}</p>
        <p className='text-muted-foreground mt-1 max-w-sm text-[13px]'>
          {isOrgAdmin ? t('emptyAdmin') : t('emptyMember')}
        </p>
        {isOrgAdmin ? (
          <Button variant='outline' size='sm' className='mt-4' asChild>
            <Link href='/dashboard/campaigns'>{t('goToCampaigns')}</Link>
          </Button>
        ) : null}
      </StateCard>
    );
  } else {
    body = (
      <>
        <CampaignBar
          campaigns={campaigns}
          selected={selected}
          onSelect={select}
        />
        <SessionStartCard
          onStart={startCalling}
          lineReady={lineReady}
          shortcut={{
            key: 'N',
            hint: (
              <Kbd onColor className='ml-1 hidden sm:inline-flex'>
                N
              </Kbd>
            )
          }}
          className='max-w-none'
        />
      </>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      {body}

      {sessionCampaign ? (
        <AgentSessionDialog
          campaignId={sessionCampaign.id}
          campaignName={sessionCampaign.name}
          open={sessionOpen}
          autoStart
          onClose={() => {
            setSessionOpen(false);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}
