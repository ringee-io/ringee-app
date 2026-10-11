'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useTranslations } from 'next-intl';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { CampaignsView } from './campaigns/campaigns-view';
import { UnlockCampaignsButton } from './campaigns/unlock-campaigns-button';
import { MyDayView } from './my-day/my-day-view';
import { TodayDate } from './my-day/today-date';

const TABS = ['my-day', 'campaigns'] as const;
const STORAGE_PREFIX = 'ringee:call-tab';

const TRIGGER_CLASSES =
  'h-8 flex-none gap-1.5 px-4 data-[state=active]:font-semibold';

/**
 * The Call page: where a calling day starts. "My day" is the user's own
 * queue; "Campaigns" opens a campaign's calling session over the page.
 *
 * Campaigns need an organization (CMP-001). In a personal workspace the tab
 * is replaced by the way to one, so the tab never opens onto a refusal.
 */
export default function CallPageView() {
  const t = useTranslations('calls.myDay');
  const { isLoaded, hasOrg } = useOrgRole();
  const { isLoaded: authLoaded, userId, orgId } = useAuth();
  const storageKey =
    authLoaded && userId
      ? `${STORAGE_PREFIX}:${userId}:${orgId ?? 'personal'}`
      : null;
  // The tab lives in the URL (shallow — no server round trip), so a reload or
  // a link lands on the same view. Without a tab, restore this workspace's pick.
  const [tabParam, setTabParam] = useQueryState(
    'tab',
    parseAsStringLiteral(TABS)
  );
  const [remembered, setRemembered] = useState<{
    key: string;
    tab: (typeof TABS)[number];
  } | null>(null);
  const locked = isLoaded && !hasOrg;

  useEffect(() => {
    if (!storageKey || !isLoaded) return;
    let nextTab = tabParam ?? 'my-day';
    if (tabParam === null) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved === 'my-day' || saved === 'campaigns') nextTab = saved;
      } catch {
        // Storage unavailable: use the URL or the default tab.
      }
    }
    if (locked) nextTab = 'my-day';
    try {
      localStorage.setItem(storageKey, nextTab);
    } catch {
      // Storage unavailable: tab navigation still works through the URL.
    }
    setRemembered({ key: storageKey, tab: nextTab });
  }, [isLoaded, locked, storageKey, tabParam]);

  // Wait for the remembered pick before mounting a view and its requests.
  const ready = isLoaded && !!storageKey && remembered?.key === storageKey;
  const selectedTab = tabParam ?? (ready ? remembered.tab : 'my-day');
  const tab = selectedTab === 'campaigns' && !locked ? 'campaigns' : 'my-day';

  return (
    <Tabs
      value={tab}
      onValueChange={(next) =>
        void setTabParam(next === 'campaigns' ? 'campaigns' : 'my-day')
      }
      className='w-full gap-5'
    >
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-bold tracking-tight'>{t('title')}</h1>
          <TodayDate className='text-muted-foreground text-[13px]' />
        </div>
        {/* The tab strip's frame holds the unlock button too: it sits where
            the Campaigns tab would, but it is a button, not a tab. */}
        <div className='bg-muted text-muted-foreground inline-flex h-10 items-center rounded-lg border p-1'>
          <TabsList aria-label={t('tabs.label')} className='h-full p-0'>
            <TabsTrigger
              value='my-day'
              disabled={!ready}
              className={TRIGGER_CLASSES}
            >
              {t('tabs.myDay')}
            </TabsTrigger>
            {locked ? null : (
              <TabsTrigger
                value='campaigns'
                disabled={!ready}
                className={TRIGGER_CLASSES}
              >
                {t('tabs.campaigns')}
              </TabsTrigger>
            )}
          </TabsList>
          {locked ? <UnlockCampaignsButton /> : null}
        </div>
      </div>

      {!ready ? null : tab === 'my-day' ? (
        <TabsContent value='my-day'>
          <MyDayView />
        </TabsContent>
      ) : isLoaded ? (
        <TabsContent value='campaigns'>
          <CampaignsView />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
