import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardFooter
} from '@ringee/frontend-shared/components/ui/card';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import {
  IconTrendingDown,
  IconTrendingUp,
  IconPhoneCall,
  IconPhoneOff
} from '@tabler/icons-react';
import React from 'react';

// 🧠 Helper para formatear duración inteligentemente
function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export async function OverviewCards({ useMock, memberId }: { useMock?: boolean; memberId?: string }) {
  const {
    total,
    answered,
    missed,
    averageDuration,
    durationChange,
    weeklyGrowth,
    growthRate,
    answerRate,
    missedRate
  } = await apiServer.get(
    '/dashboard/overview',
    useMock ? { mock: true } : { memberId }
  );

  const avgFormatted = formatDuration(averageDuration);
  const durationPositive = durationChange >= 0;

  return (
    <div className='*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs md:grid-cols-2 lg:grid-cols-4'>
      {/* 🟦 Total Calls */}
      <Card className='@container/card'>
        <CardHeader>
          <CardDescription>Total Calls</CardDescription>
          <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
            {total.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge variant='outline' className='flex items-center gap-1'>
              <IconTrendingUp size={16} />+{growthRate?.toFixed(1) ?? '0'}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className='flex-col items-start gap-1.5 text-sm'>
          <div className='flex gap-2 font-medium'>
            Trending up this month <IconTrendingUp className='size-4' />
          </div>
          <div className='text-muted-foreground'>
            Connection rate for the last 6 months
          </div>
          <div className='flex gap-3 pt-2'>
            <Badge
              variant='secondary'
              className='flex items-center gap-1 text-green-600'
            >
              <IconPhoneCall size={14} /> {answerRate?.toFixed(1)}% answered
            </Badge>
            <Badge
              variant='secondary'
              className='flex items-center gap-1 text-red-600'
            >
              <IconPhoneOff size={14} /> {missedRate?.toFixed(1)}% missed
            </Badge>
          </div>
        </CardFooter>
      </Card>

      {/* 🕒 Average Duration */}
      <Card className='@container/card'>
        <CardHeader>
          <CardDescription>Average Duration</CardDescription>
          <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
            {avgFormatted}
          </CardTitle>
          <CardAction>
            <Badge
              variant='outline'
              className={`flex items-center gap-1 ${durationPositive ? 'text-green-600' : 'text-red-600'
                }`}
            >
              {durationPositive ? (
                <>
                  <IconTrendingUp size={16} /> +{durationChange.toFixed(1)}%
                </>
              ) : (
                <>
                  <IconTrendingDown size={16} /> {durationChange.toFixed(1)}%
                </>
              )}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className='flex-col items-start gap-1.5 text-sm'>
          {durationPositive ? (
            <div className='flex gap-2 font-medium text-green-600'>
              Up {durationChange.toFixed(1)}% this period{' '}
              <IconTrendingUp className='size-4' />
            </div>
          ) : (
            <div className='flex gap-2 font-medium text-red-600'>
              Down {Math.abs(durationChange).toFixed(1)}% this period{' '}
              <IconTrendingDown className='size-4' />
            </div>
          )}
          <div className='text-muted-foreground'>
            {durationPositive
              ? 'Users are staying longer on calls'
              : 'Average call duration decreased'}
          </div>
        </CardFooter>
      </Card>

      {/* 📈 Weekly Growth */}
      <Card className='@container/card'>
        <CardHeader>
          <CardDescription>Weekly Growth</CardDescription>
          <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
            {weeklyGrowth > 0
              ? `+${weeklyGrowth?.toFixed(1) ?? '0'}% 📈`
              : `${weeklyGrowth?.toFixed(1) ?? '0'}% 📉`}
          </CardTitle>
          <CardAction>
            <Badge variant='outline' className='flex items-center gap-1'>
              {weeklyGrowth > 0 ? (
                <>
                  <IconTrendingUp size={16} />+{weeklyGrowth?.toFixed(1) ?? '0'}
                  %
                </>
              ) : (
                <>
                  <IconTrendingDown size={16} />
                  {weeklyGrowth?.toFixed(1) ?? '0'}%
                </>
              )}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className='flex-col items-start gap-1.5 text-sm'>
          <div className='flex gap-2 font-medium'>
            Strong user retention <IconTrendingUp className='size-4' />
          </div>
          <div className='text-muted-foreground'>
            Engagement exceeds targets
          </div>
        </CardFooter>
      </Card>

      {/* 🚀 Growth Rate */}
      <Card className='@container/card'>
        <CardHeader>
          <CardDescription>Growth Rate</CardDescription>
          <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
            {growthRate > 0
              ? `+${growthRate?.toFixed(1) ?? '0'}% 📈`
              : `${growthRate?.toFixed(1) ?? '0'}% 📉`}
          </CardTitle>
          <CardAction>
            <Badge variant='outline' className='flex items-center gap-1'>
              {growthRate > 0 ? (
                <>
                  <IconTrendingUp size={16} />+{growthRate?.toFixed(1)}%
                </>
              ) : (
                <>
                  <IconTrendingDown size={16} />
                  {growthRate?.toFixed(1)}%
                </>
              )}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className='flex-col items-start gap-1.5 text-sm'>
          <div className='flex gap-2 font-medium'>
            Steady performance increase <IconTrendingUp className='size-4' />
          </div>
          <div className='text-muted-foreground'>Meets growth projections</div>
        </CardFooter>
      </Card>
    </div>
  );
}
