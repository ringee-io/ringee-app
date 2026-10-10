import { getTranslations } from 'next-intl/server';
import { Lock } from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { MyDayView } from './my-day/my-day-view';
import { TodayDate } from './my-day/today-date';

const TRIGGER_CLASSES =
  'h-8 flex-none gap-1.5 px-4 data-[state=active]:font-semibold';

/**
 * The Call page: where a calling day starts. "My day" is the only source for
 * now; campaign sessions will join it as a second tab.
 */
export default async function CallPageView() {
  const t = await getTranslations('calls.myDay');

  return (
    <Tabs value='my-day' className='w-full gap-5'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-bold tracking-tight'>{t('title')}</h1>
          <TodayDate className='text-muted-foreground text-[13px]' />
        </div>
        <TabsList aria-label={t('tabs.label')} className='h-10 border p-1'>
          <TabsTrigger value='my-day' className={TRIGGER_CLASSES}>
            {t('tabs.myDay')}
          </TabsTrigger>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* A disabled tab takes no pointer events: the tooltip hangs
                  off its wrapper. */}
              <span className='inline-flex'>
                <TabsTrigger
                  value='campaigns'
                  disabled
                  className={TRIGGER_CLASSES}
                >
                  <Lock className='size-3.5' />
                  {t('tabs.campaigns')}
                  <span className='sr-only'>{t('tabs.campaignsSoon')}</span>
                </TabsTrigger>
              </span>
            </TooltipTrigger>
            <TooltipContent side='bottom'>
              {t('tabs.campaignsSoon')}
            </TooltipContent>
          </Tooltip>
        </TabsList>
      </div>

      <TabsContent value='my-day'>
        <MyDayView />
      </TabsContent>
    </Tabs>
  );
}
