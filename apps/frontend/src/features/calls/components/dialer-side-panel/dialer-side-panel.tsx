'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CalendarClock,
  CalendarDays,
  History,
  Loader2,
  PhoneForwarded
} from 'lucide-react';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card } from '@ringee/frontend-shared/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { useCallbackDial } from '../../hooks/use.callback.dial';
import { useDialerCallbacks } from '../../hooks/use.dialer.callbacks';
import { CallbacksTab } from './callbacks-tab';
import { RecentCallsTab } from './recent-calls-tab';
import { TodayTab } from './today-tab';

export function DialerSidePanel() {
  const t = useTranslations('dialer.sidePanel');
  const { callbacks, loading, refresh } = useDialerCallbacks();
  const { dialCallback, isBusy } = useCallbackDial();
  const [dialingNext, setDialingNext] = useState(false);

  const dueCount = callbacks.filter((cb) => cb.status === 'due').length;
  const totalPending = callbacks.length;
  // Callbacks come sorted oldest first, so the first due one is the most
  // overdue: working the queue is one click per call.
  const nextDue = callbacks.find((cb) => cb.status === 'due') ?? null;

  async function callNext() {
    if (!nextDue || dialingNext || isBusy) return;
    setDialingNext(true);
    try {
      if (await dialCallback(nextDue)) await refresh();
    } finally {
      setDialingNext(false);
    }
  }

  return (
    <Card className='@container/sidepanel flex h-full flex-col overflow-hidden p-0'>
      <div className='bg-muted/40 flex items-center justify-between border-b px-3 py-2.5'>
        <div className='flex min-w-0 items-center gap-2 text-sm font-semibold'>
          <CalendarClock className='text-muted-foreground h-4 w-4 shrink-0' />
          <span className='truncate'>{t('workQueue')}</span>
        </div>
        <div className='text-muted-foreground flex items-center gap-3 text-xs'>
          {dueCount > 0 ? (
            <span className='flex items-center gap-1 font-medium text-orange-600 dark:text-orange-400'>
              <span className='inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500' />
              {t('dueCount', { count: dueCount })}
            </span>
          ) : (
            <span>{t('pendingCount', { count: totalPending })}</span>
          )}
          {nextDue ? (
            <Button
              size='sm'
              onClick={callNext}
              disabled={dialingNext || isBusy}
              title={t('callNextHint', {
                name: nextDue.contact.name || nextDue.contact.phoneNumber
              })}
              className='h-7 gap-1.5 bg-green-600 px-2.5 text-xs text-white hover:bg-green-700'
            >
              {dialingNext ? (
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
              ) : (
                <PhoneForwarded className='h-3.5 w-3.5' />
              )}
              {t('callNext')}
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue='callbacks' className='flex flex-1 flex-col gap-0'>
        <TabsList className='bg-background h-10 w-full justify-start rounded-none border-b p-0'>
          <TabsTrigger
            value='callbacks'
            className='data-[state=active]:bg-muted/30 data-[state=active]:border-primary h-10 min-w-0 flex-1 gap-1 rounded-none border-b-2 border-transparent px-1.5 data-[state=active]:shadow-none'
          >
            <CalendarClock className='h-3.5 w-3.5 shrink-0' />
            <span className='hidden truncate @[18rem]/sidepanel:inline'>
              {t('tabs.callbacks')}
            </span>
            {totalPending > 0 && (
              <Badge
                variant='secondary'
                className='h-4 min-w-4 px-1 text-[10px] font-semibold'
              >
                {totalPending}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value='today'
            className='data-[state=active]:bg-muted/30 data-[state=active]:border-primary h-10 min-w-0 flex-1 gap-1 rounded-none border-b-2 border-transparent px-1.5 data-[state=active]:shadow-none'
          >
            <CalendarDays className='h-3.5 w-3.5 shrink-0' />
            <span className='hidden truncate @[18rem]/sidepanel:inline'>
              {t('tabs.today')}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value='recent'
            className='data-[state=active]:bg-muted/30 data-[state=active]:border-primary h-10 min-w-0 flex-1 gap-1 rounded-none border-b-2 border-transparent px-1.5 data-[state=active]:shadow-none'
          >
            <History className='h-3.5 w-3.5 shrink-0' />
            <span className='hidden truncate @[18rem]/sidepanel:inline'>
              {t('tabs.recent')}
            </span>
          </TabsTrigger>
        </TabsList>

        <div className='flex-1 overflow-y-auto'>
          <TabsContent value='callbacks' className='m-0'>
            <CallbacksTab
              callbacks={callbacks}
              loading={loading}
              refresh={refresh}
            />
          </TabsContent>
          <TabsContent value='today' className='m-0'>
            <TodayTab />
          </TabsContent>
          <TabsContent value='recent' className='m-0'>
            <RecentCallsTab />
          </TabsContent>
        </div>
      </Tabs>
    </Card>
  );
}
