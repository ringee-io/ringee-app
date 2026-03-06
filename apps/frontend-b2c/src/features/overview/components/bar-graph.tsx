'use client';

import * as React from 'react';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
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
  answered: {
    label: 'Answered',
    color: 'var(--primary)'
  },
  missed: {
    label: 'Missed',
    color: 'var(--primary)'
  },
  error: {
    label: 'Error',
    color: 'var(--primary)'
  }
} satisfies ChartConfig;

type ChartPoint = {
  date: string;
  answered: number;
  missed: number;
};

interface BarGraphProps {
  data: ChartPoint[];
}

export function BarGraph({ data }: BarGraphProps) {
  const [activeChart, setActiveChart] =
    React.useState<keyof typeof chartConfig>('answered');

  const total = React.useMemo(
    () => ({
      answered: data.reduce((acc, curr) => acc + (curr.answered ?? 0), 0),
      missed: data.reduce((acc, curr) => acc + (curr.missed ?? 0), 0)
    }),
    [data]
  );

  return (
    <Card className='@container/card !pt-3'>
      <CardHeader className='flex flex-col items-stretch space-y-0 border-b !p-0 sm:flex-row'>
        <div className='flex flex-1 flex-col justify-center gap-1 px-6 !py-0'>
          <CardTitle>Total Calls per Day</CardTitle>
          <CardDescription>
            <span className='hidden @[540px]/card:block'>
              Activity over the last 3 months
            </span>
            <span className='@[540px]/card:hidden'>Last 3 months</span>
          </CardDescription>
        </div>

        <div className='flex'>
          {(['answered', 'missed'] as (keyof typeof chartConfig)[]).map(
            (chart) =>
              total[chart] > 0 && (
                <button
                  key={chart}
                  data-active={activeChart === chart}
                  className='data-[active=true]:bg-primary/5 hover:bg-primary/5 relative flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left transition-colors duration-200 even:border-l sm:border-t-0 sm:border-l sm:px-8 sm:py-6'
                  onClick={() => setActiveChart(chart)}
                >
                  <span className='text-muted-foreground text-xs'>
                    {chartConfig[chart].label}
                  </span>
                  <span className='text-lg leading-none font-bold sm:text-3xl'>
                    {total[chart].toLocaleString()}
                  </span>
                </button>
              )
          )}
        </div>
      </CardHeader>

      <CardContent className='px-2 pt-4 sm:px-6 sm:pt-6'>
        <ChartContainer
          config={chartConfig}
          className='aspect-auto h-[250px] w-full'
        >
          <BarChart
            data={data}
            margin={{
              left: 12,
              right: 12
            }}
          >
            <defs>
              <linearGradient id='fillBar' x1='0' y1='0' x2='0' y2='1'>
                <stop
                  offset='0%'
                  stopColor='var(--primary)'
                  stopOpacity={0.8}
                />
                <stop
                  offset='100%'
                  stopColor='var(--primary)'
                  stopOpacity={0.2}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey='date'
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                });
              }}
            />
            <ChartTooltip
              cursor={{ fill: 'var(--primary)', opacity: 0.1 }}
              content={
                <ChartTooltipContent
                  className='w-[150px]'
                  nameKey={activeChart}
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  }
                />
              }
            />
            <Bar
              dataKey={activeChart}
              fill='url(#fillBar)'
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
