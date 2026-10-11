'use client';

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
  // The tab lives in the URL (shallow — no server round trip), so a reload or
  // a link lands on the same view.
  const [tabParam, setTabParam] = useQueryState(
    'tab',
    parseAsStringLiteral(TABS).withDefault('my-day')
  );
  const locked = isLoaded && !hasOrg;
  // Until the workspace is known, a link to Campaigns waits on it rather than
  // mounting My day and its requests for nothing.
  const tab = tabParam === 'campaigns' && !locked ? 'campaigns' : 'my-day';

  return (
    <Tabs
      value={tab}
      onValueChange={(next) =>
        void setTabParam(next === 'campaigns' ? 'campaigns' : null)
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
            <TabsTrigger value='my-day' className={TRIGGER_CLASSES}>
              {t('tabs.myDay')}
            </TabsTrigger>
            {locked ? null : (
              <TabsTrigger
                value='campaigns'
                disabled={!isLoaded}
                className={TRIGGER_CLASSES}
              >
                {t('tabs.campaigns')}
              </TabsTrigger>
            )}
          </TabsList>
          {locked ? <UnlockCampaignsButton /> : null}
        </div>
      </div>

      {tab === 'my-day' ? (
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
