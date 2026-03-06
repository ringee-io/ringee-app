'use client';

import { IconTrendingUp } from '@tabler/icons-react';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@ringee/frontend-shared/components/ui/chart';

const chartConfig = {
  calls: {
    label: 'Calls'
  },
  answered: {
    label: 'Answered',
    color: 'var(--primary)'
  },
  missed: {
    label: 'Missed',
    color: 'var(--primary)'
  }
} satisfies ChartConfig;

type ChartPoint = {
  month: string;
  answered: number;
  missed: number;
};

interface AreaGraphProps {
  data: ChartPoint[];
  growthRate?: number;
}

export function AreaGraph({ data, growthRate = 0 }: AreaGraphProps) {
  return (
    <Card className='@container/card'>
      <CardHeader>
        <CardTitle>Monthly Call Trends</CardTitle>
        <CardDescription>
          Showing total calls over the last 6 months
        </CardDescription>
      </CardHeader>

      <CardContent className='px-2 pt-4 sm:px-6 sm:pt-6'>
        <ChartContainer
          config={chartConfig}
          className='aspect-auto h-[250px] w-full'
        >
          <AreaChart
            data={data}
            margin={{
              left: 12,
              right: 12
            }}
          >
            <defs>
              <linearGradient id='fillAnswered' x1='0' y1='0' x2='0' y2='1'>
                <stop
                  offset='5%'
                  stopColor='var(--color-answered)'
                  stopOpacity={1.0}
                />
                <stop
                  offset='95%'
                  stopColor='var(--color-answered)'
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id='fillMissed' x1='0' y1='0' x2='0' y2='1'>
                <stop
                  offset='5%'
                  stopColor='var(--color-missed)'
                  stopOpacity={0.8}
                />
                <stop
                  offset='95%'
                  stopColor='var(--color-missed)'
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} />
            <XAxis
              dataKey='month'
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator='dot' />}
            />

            <Area
              dataKey='missed'
              type='natural'
              fill='url(#fillMissed)'
              stroke='var(--color-missed)'
              stackId='a'
            />
            <Area
              dataKey='answered'
              type='natural'
              fill='url(#fillAnswered)'
              stroke='var(--color-answered)'
              stackId='a'
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>

      <CardFooter>
        <div className='flex w-full items-start gap-2 text-sm'>
          <div className='grid gap-2'>
            <div className='flex items-center gap-2 leading-none font-medium'>
              Trending {growthRate >= 0 ? 'up' : 'down'} by{' '}
              {Math.abs(growthRate).toFixed(1)}% this month{' '}
              <IconTrendingUp
                className={`h-4 w-4 ${
                  growthRate >= 0 ? 'text-green-500' : 'rotate-180 text-red-500'
                }`}
              />
            </div>
            <div className='text-muted-foreground flex items-center gap-2 leading-none'>
              Last 6 months overview
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
