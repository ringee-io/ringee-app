'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye } from 'lucide-react';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis
} from 'recharts';
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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent
} from '@ringee/frontend-shared/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import { DropdownMenuItem } from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import {
  TableActionCell,
  TableActionHead
} from '@ringee/frontend-shared/components/ui/table/table-action-column';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { IconArrowLeft } from '@tabler/icons-react';
import { DateRangeBar } from './date-range-bar';
import {
  CampaignStatusBadge,
  DispositionCategoryBadge,
  formatMinuteOfDay,
  formatWorkDays
} from './campaign-bits';
import { CampaignAttemptsLog } from './campaign-attempts-log';
import { useBackofficeApi, type CampaignDetail } from '../api';
import { rangeForPreset, type DateRange } from '../lib/date-presets';
import {
  errorMessage,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatMoneyPrecise,
  formatNumber,
  formatPercent
} from '../lib/format';

/**
 * Two categorical slots from the app theme, assigned in fixed order. This pair
 * (chart-1 / chart-2) is the only one in the palette that clears CVD separation
 * in both modes; chart-1 sits just under 3:1 against the dark surface, which is
 * why every chart here ships with a table view of the same numbers.
 */
const SERIES_PRIMARY = 'var(--chart-1)';
const SERIES_SECONDARY = 'var(--chart-2)';

const callsChartConfig = {
  attempts: { label: 'Calls', color: SERIES_PRIMARY },
  connected: { label: 'Connected', color: SERIES_SECONDARY }
} satisfies ChartConfig;

const costChartConfig = {
  cost: { label: 'Cost', color: SERIES_PRIMARY }
} satisfies ChartConfig;

function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function Kpi({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className='gap-2 py-4'>
      <CardHeader className='px-4 pb-0'>
        <CardDescription className='text-xs'>{label}</CardDescription>
        <CardTitle className='text-xl'>{value}</CardTitle>
        {hint && <p className='text-muted-foreground text-xs'>{hint}</p>}
      </CardHeader>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className='text-muted-foreground py-6 text-center text-sm'>{children}</p>
  );
}

/** Proportion bar used by the disposition and lead-status breakdowns. */
function ShareBar({ percent }: { percent: number }) {
  return (
    <div className='bg-muted h-2 w-full overflow-hidden rounded-full'>
      <div
        className='h-full rounded-full'
        style={{
          width: `${Math.min(Math.max(percent, 0), 100)}%`,
          backgroundColor: SERIES_PRIMARY
        }}
      />
    </div>
  );
}

export function CampaignDetailAnalytics({ id }: { id: string }) {
  const api = useBackofficeApi();
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('today'));
  const [data, setData] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDailyTable, setShowDailyTable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getCampaign(id, range.start, range.end));
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load campaign'));
    } finally {
      setLoading(false);
    }
  }, [api, id, range]);

  useEffect(() => {
    load();
  }, [load]);

  const dailyData = useMemo(
    () => (data?.daily ?? []).map((d) => ({ ...d, label: shortDay(d.day) })),
    [data]
  );

  const hourlyData = useMemo(
    () =>
      (data?.hourly ?? []).map((h) => ({
        ...h,
        label: `${String(h.hour).padStart(2, '0')}:00`
      })),
    [data]
  );

  const totalLeads = useMemo(
    () => (data?.leadsByStatus ?? []).reduce((sum, r) => sum + r.count, 0),
    [data]
  );

  if (loading && !data) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-8 w-64' />
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className='h-24 w-full' />
          ))}
        </div>
        <Skeleton className='h-[300px] w-full' />
      </div>
    );
  }

  if (!data) {
    return <Empty>Campaign not found.</Empty>;
  }

  const { campaign, metrics } = data;

  return (
    <div className='space-y-4 sm:space-y-6'>
      <div className='space-y-2'>
        <Button variant='ghost' size='sm' asChild className='-ml-2'>
          <Link href='/backoffice/campaigns'>
            <IconArrowLeft className='size-4' />
            All campaigns
          </Link>
        </Button>
        <div className='flex flex-wrap items-center gap-2'>
          <h1 className='text-xl font-semibold sm:text-2xl'>{campaign.name}</h1>
          <CampaignStatusBadge status={campaign.status} />
          <Badge variant='outline'>{campaign.dialerMode}</Badge>
        </div>
        <p className='text-muted-foreground text-sm'>
          {campaign.organizationName ? (
            <Link
              href={`/backoffice/accounts/org/${campaign.organizationId}`}
              className='hover:underline'
            >
              {campaign.organizationName}
            </Link>
          ) : (
            'Personal'
          )}
          {' · '}
          <Link
            href={`/backoffice/accounts/user/${campaign.ownerUserId}`}
            className='hover:underline'
          >
            {campaign.ownerEmail || campaign.ownerName}
          </Link>
          {' · created '}
          {formatDate(campaign.createdAt)}
        </p>
        {campaign.description && (
          <p className='text-muted-foreground text-sm'>
            {campaign.description}
          </p>
        )}
      </div>

      <DateRangeBar value={range} onChange={setRange} />

      <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'>
        <Kpi
          label='Calls'
          value={formatNumber(metrics.attempts)}
          hint={`${formatNumber(metrics.uniqueLeadsDialed)} unique leads dialed`}
        />
        <Kpi
          label='Connected'
          value={formatNumber(metrics.connected)}
          hint={`${formatPercent(metrics.contactRate)} contact rate`}
        />
        <Kpi
          label='Conversions'
          value={formatNumber(metrics.conversions)}
          hint={`${formatPercent(metrics.conversionRate)} of calls`}
        />
        <Kpi
          label='Talk time'
          value={formatDuration(metrics.talkSec)}
          hint={`${formatDuration(metrics.avgHandleTimeSec)} avg handle time`}
        />
        <Kpi label='Cost' value={formatMoney(metrics.cost)} />
        <Kpi
          label='Cost / call'
          value={formatMoneyPrecise(metrics.costPerAttempt)}
        />
        <Kpi
          label='Cost / connect'
          value={formatMoneyPrecise(metrics.costPerConnect)}
        />
        <Kpi
          label='Cost / conversion'
          value={
            metrics.conversions
              ? formatMoneyPrecise(metrics.costPerConversion)
              : '—'
          }
        />
      </div>

      <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
        <CardHeader className='flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
          <div>
            <CardTitle>Daily volume</CardTitle>
            <CardDescription>
              Calls placed and connected, per day.
            </CardDescription>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setShowDailyTable((v) => !v)}
          >
            {showDailyTable ? 'Show chart' : 'Show table'}
          </Button>
        </CardHeader>
        <CardContent className='px-4 sm:px-6'>
          {dailyData.length === 0 ? (
            <Empty>No calls in this range.</Empty>
          ) : showDailyTable ? (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead className='text-right'>Calls</TableHead>
                    <TableHead className='text-right'>Connected</TableHead>
                    <TableHead className='text-right'>Conversions</TableHead>
                    <TableHead className='text-right'>Talk</TableHead>
                    <TableHead className='text-right'>Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyData.map((d) => (
                    <TableRow key={d.day}>
                      <TableCell>{d.label}</TableCell>
                      <TableCell className='text-right'>
                        {formatNumber(d.attempts)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatNumber(d.connected)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatNumber(d.conversions)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatDuration(d.talkSec)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatMoney(d.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <ChartContainer
              config={callsChartConfig}
              className='max-h-[320px] w-full'
            >
              <LineChart data={dailyData} margin={{ left: 4, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey='label'
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  dataKey='attempts'
                  stroke='var(--color-attempts)'
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  dataKey='connected'
                  stroke='var(--color-connected)'
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
          <CardHeader className='px-4 sm:px-6'>
            <CardTitle>Daily cost</CardTitle>
            <CardDescription>
              Telephony spend attributed to this campaign.
            </CardDescription>
          </CardHeader>
          <CardContent className='px-4 sm:px-6'>
            {dailyData.length === 0 ? (
              <Empty>No spend in this range.</Empty>
            ) : (
              <ChartContainer
                config={costChartConfig}
                className='max-h-[260px] w-full'
              >
                <BarChart data={dailyData} margin={{ left: 4, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey='label'
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={24}
                  />
                  <YAxis tickLine={false} axisLine={false} width={48} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey='cost'
                    fill='var(--color-cost)'
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
          <CardHeader className='px-4 sm:px-6'>
            <CardTitle>Hour of day</CardTitle>
            <CardDescription>
              When this campaign dials, and when it connects.
            </CardDescription>
          </CardHeader>
          <CardContent className='px-4 sm:px-6'>
            {hourlyData.length === 0 ? (
              <Empty>No calls in this range.</Empty>
            ) : (
              <ChartContainer
                config={callsChartConfig}
                className='max-h-[260px] w-full'
              >
                <BarChart data={hourlyData} margin={{ left: 4, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey='label'
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={16}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    allowDecimals={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar
                    dataKey='attempts'
                    fill='var(--color-attempts)'
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey='connected'
                    fill='var(--color-connected)'
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
          <CardHeader className='px-4 sm:px-6'>
            <CardTitle>Dispositions</CardTitle>
            <CardDescription>
              How agents closed out each call in this range.
            </CardDescription>
          </CardHeader>
          <CardContent className='px-4 sm:px-6'>
            {data.dispositions.length === 0 ? (
              <Empty>No dispositioned calls in this range.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Disposition</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className='text-right'>Count</TableHead>
                    <TableHead className='w-32'>Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.dispositions.map((d) => (
                    <TableRow key={d.code}>
                      <TableCell className='font-medium'>
                        {d.label || d.code}
                      </TableCell>
                      <TableCell>
                        <DispositionCategoryBadge category={d.category} />
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatNumber(d.count)}
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center gap-2'>
                          <ShareBar percent={d.percentage} />
                          <span className='text-muted-foreground w-12 shrink-0 text-right text-xs'>
                            {formatPercent(d.percentage)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
          <CardHeader className='px-4 sm:px-6'>
            <CardTitle>Lead funnel</CardTitle>
            <CardDescription>
              Current state of all {formatNumber(totalLeads)} leads (lifetime,
              not range-scoped).
            </CardDescription>
          </CardHeader>
          <CardContent className='px-4 sm:px-6'>
            {data.leadsByStatus.length === 0 ? (
              <Empty>This campaign has no leads.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className='text-right'>Leads</TableHead>
                    <TableHead className='w-32'>Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.leadsByStatus.map((r) => {
                    const pct = totalLeads ? (r.count / totalLeads) * 100 : 0;
                    return (
                      <TableRow key={r.status}>
                        <TableCell className='font-medium'>
                          {r.status.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatNumber(r.count)}
                        </TableCell>
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            <ShareBar percent={pct} />
                            <span className='text-muted-foreground w-12 shrink-0 text-right text-xs'>
                              {formatPercent(Math.round(pct * 10) / 10)}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
        <CardHeader className='px-4 sm:px-6'>
          <CardTitle>Agent performance</CardTitle>
          <CardDescription>
            Every agent who dialed for this campaign in this range.
          </CardDescription>
        </CardHeader>
        <CardContent className='px-4 sm:px-6'>
          {data.agents.length === 0 ? (
            <Empty>No agent activity in this range.</Empty>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className='text-right'>Calls</TableHead>
                    <TableHead className='text-right'>Connected</TableHead>
                    <TableHead className='text-right'>Contact rate</TableHead>
                    <TableHead className='text-right'>Conversions</TableHead>
                    <TableHead className='text-right'>Talk</TableHead>
                    <TableHead className='text-right'>AHT</TableHead>
                    <TableHead className='text-right'>Cost</TableHead>
                    <TableActionHead>
                      <span className='sr-only'>Actions</span>
                    </TableActionHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.agents.map((a) => (
                    <TableRow key={a.agentUserId}>
                      <TableCell>
                        <Link
                          href={`/backoffice/accounts/user/${a.agentUserId}`}
                          className='hover:underline'
                        >
                          <span className='font-medium'>{a.name}</span>
                          {a.email && (
                            <span className='text-muted-foreground block text-xs'>
                              {a.email}
                            </span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatNumber(a.attempts)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatNumber(a.connected)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatPercent(a.contactRate)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatNumber(a.conversions)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatDuration(a.talkSec)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatDuration(a.avgHandleTimeSec)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatMoney(a.cost)}
                      </TableCell>
                      <TableActionCell>
                        <TableRowActions
                          label='Open actions menu'
                          menuLabel='Actions'
                        >
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/backoffice/accounts/user/${a.agentUserId}`}
                            >
                              <Eye className='size-4' />
                              View
                            </Link>
                          </DropdownMenuItem>
                        </TableRowActions>
                      </TableActionCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CampaignAttemptsLog id={id} range={range} />

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
          <CardHeader className='px-4 sm:px-6'>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className='px-4 sm:px-6'>
            <dl className='grid grid-cols-2 gap-x-4 gap-y-3 text-sm'>
              <div>
                <dt className='text-muted-foreground text-xs'>Dialer mode</dt>
                <dd>{campaign.dialerMode}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground text-xs'>Max attempts</dt>
                <dd>{campaign.maxAttempts}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground text-xs'>Timezone</dt>
                <dd>{campaign.timezone}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground text-xs'>Working hours</dt>
                <dd>
                  {formatMinuteOfDay(campaign.workStartMin)}–
                  {formatMinuteOfDay(campaign.workEndMin)}
                </dd>
              </div>
              <div className='col-span-2'>
                <dt className='text-muted-foreground text-xs'>Work days</dt>
                <dd>{formatWorkDays(campaign.workDays)}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground text-xs'>Wrap-up</dt>
                <dd>{campaign.wrapUpTimeSec}s</dd>
              </div>
              <div>
                <dt className='text-muted-foreground text-xs'>Retry delay</dt>
                <dd>{campaign.retryDelayMin} min</dd>
              </div>
              <div>
                <dt className='text-muted-foreground text-xs'>Caller ID</dt>
                <dd>{campaign.callerIdNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground text-xs'>
                  Outbound number
                </dt>
                <dd>{campaign.outboundNumber ?? '—'}</dd>
              </div>
              <div className='col-span-2'>
                <dt className='text-muted-foreground text-xs'>Rotation pool</dt>
                <dd>
                  {campaign.rotationNumbers.length
                    ? campaign.rotationNumbers.join(', ')
                    : 'Whole workspace pool'}
                </dd>
              </div>
              <div className='col-span-2'>
                <dt className='text-muted-foreground text-xs'>Last updated</dt>
                <dd>{formatDateTime(campaign.updatedAt)}</dd>
              </div>
            </dl>

            {data.retryRules.length > 0 && (
              <div className='mt-4'>
                <p className='text-muted-foreground mb-2 text-xs'>
                  Retry rules
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className='text-right'>Max</TableHead>
                      <TableHead className='text-right'>Delay</TableHead>
                      <TableHead className='text-right'>Multiplier</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.retryRules.map((r) => (
                      <TableRow key={r.dispositionCategory}>
                        <TableCell>
                          {r.dispositionCategory.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className='text-right'>
                          {r.maxAttempts}
                        </TableCell>
                        <TableCell className='text-right'>
                          {r.delayMinutes} min
                        </TableCell>
                        <TableCell className='text-right'>
                          ×{r.delayMultiplier}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className='space-y-4'>
          <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
            <CardHeader className='px-4 sm:px-6'>
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <CardContent className='px-4 sm:px-6'>
              {data.members.length === 0 ? (
                <Empty>No members assigned.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className='text-right'>Since</TableHead>
                      <TableActionHead>
                        <span className='sr-only'>Actions</span>
                      </TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.members.map((m) => (
                      <TableRow key={m.userId}>
                        <TableCell>
                          <Link
                            href={`/backoffice/accounts/user/${m.userId}`}
                            className='hover:underline'
                          >
                            <span className='font-medium'>{m.name}</span>
                            {m.email && (
                              <span className='text-muted-foreground block text-xs'>
                                {m.email}
                              </span>
                            )}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant='outline'>{m.role}</Badge>
                        </TableCell>
                        <TableCell className='text-muted-foreground text-right text-xs'>
                          {formatDate(m.assignedAt)}
                        </TableCell>
                        <TableActionCell>
                          <TableRowActions
                            label='Open actions menu'
                            menuLabel='Actions'
                          >
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/backoffice/accounts/user/${m.userId}`}
                              >
                                <Eye className='size-4' />
                                View
                              </Link>
                            </DropdownMenuItem>
                          </TableRowActions>
                        </TableActionCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
            <CardHeader className='px-4 sm:px-6'>
              <CardTitle>Lead lists</CardTitle>
            </CardHeader>
            <CardContent className='px-4 sm:px-6'>
              {data.lists.length === 0 ? (
                <Empty>No lists — leads were added directly.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>List</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className='text-right'>Leads</TableHead>
                      <TableHead className='text-right'>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.lists.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className='font-medium'>{l.name}</TableCell>
                        <TableCell className='text-muted-foreground'>
                          {l.source ?? '—'}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatNumber(l.leads)}
                        </TableCell>
                        <TableCell className='text-muted-foreground text-right text-xs'>
                          {formatDate(l.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
