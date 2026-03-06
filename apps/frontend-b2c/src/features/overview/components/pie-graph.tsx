'use client';

import * as React from 'react';
import { IconTrendingUp } from '@tabler/icons-react';
import { Label, Pie, PieChart } from 'recharts';
import { format, subMonths } from 'date-fns';

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
  morning: {
    label: 'Morning (06:00–12:00)',
    color: 'var(--primary)'
  },
  afternoon: {
    label: 'Afternoon (12:00–18:00)',
    color: 'var(--primary)'
  },
  evening: {
    label: 'Evening (18:00–24:00)',
    color: 'var(--primary)'
  },
  night: {
    label: 'Night (00:00–06:00)',
    color: 'var(--primary)'
  }
} satisfies ChartConfig;

type ChartPoint = {
  period: 'morning' | 'afternoon' | 'evening' | 'night';
  total: number;
};

interface PieGraphProps {
  data: ChartPoint[];
  rangeStart?: Date;
  rangeEnd?: Date;
}

export function PieGraph({ data, rangeStart, rangeEnd }: PieGraphProps) {
  // Calcular rango de meses dinámico
  const now = new Date();
  const start = rangeStart ?? subMonths(now, 6);
  const end = rangeEnd ?? now;
  const fromLabel = format(start, 'MMMM');
  const toLabel = format(end, 'MMMM');

  const totalCalls = React.useMemo(
    () => data.reduce((acc, curr) => acc + curr.total, 0),
    [data]
  );

  const leadingPeriod = React.useMemo(() => {
    if (!data.length) return null;
    const max = data.reduce(
      (prev, curr) => (curr.total > prev.total ? curr : prev),
      data[0]
    );
    const percentage = totalCalls
      ? ((max.total / totalCalls) * 100).toFixed(1)
      : '0.0';
    return { ...max, percentage };
  }, [data, totalCalls]);

  return (
    <Card className='@container/card'>
      <CardHeader>
        <CardTitle>Call Traffic by Time of Day</CardTitle>
        <CardDescription>
          <span className='hidden @[540px]/card:block'>
            Total calls by time of day for the last 6 months
          </span>
          <span className='@[540px]/card:hidden'>Browser distribution</span>
        </CardDescription>
      </CardHeader>

      <CardContent className='px-2 pt-4 sm:px-6 sm:pt-6'>
        <ChartContainer
          config={chartConfig}
          className='mx-auto aspect-square h-[250px]'
        >
          <PieChart>
            <defs>
              {data.map((item, index) => (
                <linearGradient
                  key={item.period}
                  id={`fill${item.period}`}
                  x1='0'
                  y1='0'
                  x2='0'
                  y2='1'
                >
                  <stop
                    offset='0%'
                    stopColor='var(--primary)'
                    stopOpacity={1 - index * 0.15}
                  />
                  <stop
                    offset='100%'
                    stopColor='var(--primary)'
                    stopOpacity={0.8 - index * 0.15}
                  />
                </linearGradient>
              ))}
            </defs>

            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />

            <Pie
              data={data.map((item) => ({
                name: chartConfig[item.period].label,
                value: item.total,
                fill: `url(#fill${item.period})`
              }))}
              dataKey='value'
              nameKey='name'
              innerRadius={60}
              strokeWidth={2}
              stroke='var(--background)'
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor='middle'
                        dominantBaseline='middle'
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className='fill-foreground text-3xl font-bold'
                        >
                          {totalCalls.toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className='fill-muted-foreground text-sm'
                        >
                          Total calls
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>

      <CardFooter className='flex-col gap-2 text-sm'>
        {leadingPeriod ? (
          <>
            <div className='flex items-center gap-2 leading-none font-medium'>
              {chartConfig[leadingPeriod.period].label} leads with{' '}
              {leadingPeriod.percentage}% <IconTrendingUp className='h-4 w-4' />
            </div>
            <div className='text-muted-foreground leading-none'>
              Based on data from {fromLabel} – {toLabel} {format(end, 'yyyy')}
            </div>
          </>
        ) : (
          <div className='text-muted-foreground w-full text-center'>
            Not enough data to display
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
