'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@ringee/frontend-shared/components/ui/chart';
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Pie,
  PieChart,
  Cell,
  Label
} from 'recharts';
import {
  Phone,
  PhoneIncoming,
  Clock,
  TrendingUp,
  BarChart3,
  RefreshCw
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Disposition } from '../types/campaign.types';

/** Matches OutboundAnalyticsRepository.getCampaignSummary + leadsByStatus. */
interface AnalyticsSummary {
  totalAttempts: number;
  connected: number;
  conversions: number;
  avgHandleTimeSec: number | null;
  uniqueLeadsDialed: number;
  contactRate: number; // already a percentage (0-100)
  conversionRate: number; // already a percentage (0-100)
  leadsByStatus?: { status: string; count: number }[];
}

interface DispositionDist {
  dispositionCode: string;
  count: number;
  percentage: number;
}

interface AgentPerf {
  agentUserId: string;
  attempts: number;
  connected: number;
  totalTalkSec: number;
  conversions: number;
  contactRate: number; // already a percentage (0-100)
}

interface DispositionByAgent {
  agentUserId: string;
  dispositionCode: string;
  count: number;
}

interface CampaignMember {
  id: string;
  userId: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    emails?: { email: string }[];
  };
}

const DISPOSITION_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#8b5cf6',
  '#f59e0b',
  '#06b6d4',
  '#ec4899',
  '#10b981'
];

function formatTime(sec: number | null | undefined): string {
  const s = sec ?? 0;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

interface Props {
  campaignId: string;
}

export function CampaignAnalytics({ campaignId }: Props) {
  const api = useApi();
  const t = useTranslations('campaigns.analytics');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [dispositions, setDispositions] = useState<DispositionDist[]>([]);
  const [agents, setAgents] = useState<AgentPerf[]>([]);
  const [dispositionsByAgent, setDispositionsByAgent] = useState<
    DispositionByAgent[]
  >([]);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [dispoConfig, setDispoConfig] = useState<Disposition[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [campaignId]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const [s, d, a, dba, m, dc] = await Promise.all([
        api.get<AnalyticsSummary>(`/campaigns/${campaignId}/analytics/summary`),
        api.get<DispositionDist[]>(
          `/campaigns/${campaignId}/analytics/dispositions`
        ),
        api.get<AgentPerf[]>(`/campaigns/${campaignId}/analytics/agents`),
        api.get<DispositionByAgent[]>(
          `/campaigns/${campaignId}/analytics/dispositions-by-agent`
        ),
        api.get<CampaignMember[]>(`/campaigns/${campaignId}/members`),
        api.get<Disposition[]>(`/campaigns/${campaignId}/dispositions`)
      ]);
      setSummary(s);
      setDispositions(d);
      setAgents(a);
      setDispositionsByAgent(dba);
      setMembers(m);
      setDispoConfig(dc);
    } catch {
      // handled by api client
    } finally {
      setLoading(false);
    }
  }

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => {
      const name =
        `${m.user.firstName || ''} ${m.user.lastName || ''}`.trim() ||
        'Unknown';
      map.set(m.userId, name);
    });
    return map;
  }, [members]);

  // Map disposition codes -> human-friendly labels (falls back to the code).
  const dispoLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    dispoConfig.forEach((d) => map.set(d.code, d.label));
    return map;
  }, [dispoConfig]);

  function getAgentName(userId: string): string {
    return (
      memberNameMap.get(userId) ||
      `${userId?.slice(0, 8) ?? t('unknownAgent')}…`
    );
  }

  function getDispoLabel(code: string): string {
    return dispoLabelMap.get(code) || code;
  }

  // Disposition pie chart data
  const pieData = useMemo(() => {
    return dispositions.map((d, i) => ({
      name: getDispoLabel(d.dispositionCode),
      value: d.count,
      fill: DISPOSITION_COLORS[i % DISPOSITION_COLORS.length]
    }));
  }, [dispositions, dispoLabelMap]);

  const pieChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    dispositions.forEach((d, i) => {
      config[d.dispositionCode] = {
        label: getDispoLabel(d.dispositionCode),
        color: DISPOSITION_COLORS[i % DISPOSITION_COLORS.length]
      };
    });
    return config;
  }, [dispositions, dispoLabelMap]);

  // Filtered dispositions by agent for the bar chart
  const agentDispositionBarData = useMemo(() => {
    let entries: { dispositionCode: string; count: number }[];
    if (selectedAgent === 'all') {
      const byDisp = new Map<string, number>();
      dispositionsByAgent.forEach((d) => {
        byDisp.set(
          d.dispositionCode,
          (byDisp.get(d.dispositionCode) || 0) + d.count
        );
      });
      entries = Array.from(byDisp.entries()).map(([code, count]) => ({
        dispositionCode: code,
        count
      }));
    } else {
      entries = dispositionsByAgent.filter(
        (d) => d.agentUserId === selectedAgent
      );
    }
    return entries
      .map((e) => ({ ...e, label: getDispoLabel(e.dispositionCode) }))
      .sort((a, b) => b.count - a.count);
  }, [dispositionsByAgent, selectedAgent, dispoLabelMap]);

  const barChartConfig: ChartConfig = {
    count: {
      label: t('charts.count'),
      color: 'var(--primary)'
    }
  };

  // Agent performance bar chart data
  const agentPerfBarData = useMemo(() => {
    return agents.map((a) => ({
      name: getAgentName(a.agentUserId),
      attempts: a.attempts,
      connected: a.connected
    }));
  }, [agents, memberNameMap]);

  const agentPerfChartConfig: ChartConfig = {
    attempts: {
      label: t('charts.attempts'),
      color: 'var(--chart-1)'
    },
    connected: {
      label: t('charts.connected'),
      color: 'var(--chart-2)'
    }
  };

  const totalDispositioned = useMemo(
    () => dispositions.reduce((sum, d) => sum + d.count, 0),
    [dispositions]
  );

  if (loading) {
    return (
      <div className='space-y-4'>
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className='pb-2'>
                <Skeleton className='h-4 w-20' />
              </CardHeader>
              <CardContent>
                <Skeleton className='h-8 w-16' />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className='h-[300px] w-full' />
      </div>
    );
  }

  const hasActivity = (summary?.totalAttempts ?? 0) > 0;

  return (
    <div className='space-y-6'>
      {/* Summary Cards */}
      {summary && (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardDescription>{t('cards.totalCalls')}</CardDescription>
              <Phone className='text-muted-foreground h-4 w-4' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{summary.totalAttempts}</div>
              <p className='text-muted-foreground text-xs'>
                {t('cards.uniqueLeads', { count: summary.uniqueLeadsDialed })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardDescription>{t('cards.connected')}</CardDescription>
              <PhoneIncoming className='text-muted-foreground h-4 w-4' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{summary.connected}</div>
              <p className='text-muted-foreground text-xs'>
                {t('cards.contactRate', {
                  rate: Math.round(summary.contactRate)
                })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardDescription>{t('cards.conversions')}</CardDescription>
              <TrendingUp className='text-muted-foreground h-4 w-4' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{summary.conversions}</div>
              <p className='text-muted-foreground text-xs'>
                {t('cards.conversionRate', {
                  rate: Math.round(summary.conversionRate)
                })}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardDescription>{t('cards.avgTalkTime')}</CardDescription>
              <Clock className='text-muted-foreground h-4 w-4' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {formatTime(summary.avgHandleTimeSec)}
              </div>
              <p className='text-muted-foreground text-xs'>
                {t('cards.perConnectedCall')}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {!hasActivity ? (
        <Card>
          <CardContent className='flex flex-col items-center justify-center py-16 text-center'>
            <BarChart3 className='text-muted-foreground mb-4 h-12 w-12' />
            <h3 className='text-lg font-semibold'>{t('empty.title')}</h3>
            <p className='text-muted-foreground mt-1 max-w-sm text-sm'>
              {t('empty.description')}
            </p>
            <Button
              variant='outline'
              size='sm'
              className='mt-4'
              onClick={loadAnalytics}
            >
              <RefreshCw className='mr-2 h-4 w-4' />
              {t('empty.refresh')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Charts Row 1: Disposition Pie + Agent Performance Bar */}
          <div className='grid gap-6 lg:grid-cols-2'>
            {/* Disposition Distribution Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>{t('distribution.title')}</CardTitle>
                <CardDescription>
                  {t('distribution.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {dispositions.length === 0 ? (
                  <p className='text-muted-foreground py-12 text-center text-sm'>
                    {t('distribution.empty')}
                  </p>
                ) : (
                  <>
                    <ChartContainer
                      config={pieChartConfig}
                      className='mx-auto aspect-square h-[280px]'
                    >
                      <PieChart>
                        <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent hideLabel />}
                        />
                        <Pie
                          data={pieData}
                          dataKey='value'
                          nameKey='name'
                          innerRadius={60}
                          strokeWidth={2}
                          stroke='var(--background)'
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={index} fill={entry.fill} />
                          ))}
                          <Label
                            content={({ viewBox }) => {
                              if (
                                viewBox &&
                                'cx' in viewBox &&
                                'cy' in viewBox
                              ) {
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
                                      {totalDispositioned}
                                    </tspan>
                                    <tspan
                                      x={viewBox.cx}
                                      y={(viewBox.cy || 0) + 24}
                                      className='fill-muted-foreground text-sm'
                                    >
                                      {t('distribution.centerLabel')}
                                    </tspan>
                                  </text>
                                );
                              }
                            }}
                          />
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    {/* Legend */}
                    <div className='mt-4 grid grid-cols-2 gap-2'>
                      {dispositions.map((d, i) => (
                        <div
                          key={i}
                          className='flex items-center gap-2 text-sm'
                        >
                          <div
                            className='h-3 w-3 shrink-0 rounded-full'
                            style={{
                              backgroundColor:
                                DISPOSITION_COLORS[
                                  i % DISPOSITION_COLORS.length
                                ]
                            }}
                          />
                          <span className='text-muted-foreground truncate'>
                            {getDispoLabel(d.dispositionCode)}
                          </span>
                          <span className='ml-auto font-medium'>{d.count}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Agent Performance Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>{t('agentPerformance.title')}</CardTitle>
                <CardDescription>
                  {t('agentPerformance.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {agents.length === 0 ? (
                  <p className='text-muted-foreground py-12 text-center text-sm'>
                    {t('agentPerformance.empty')}
                  </p>
                ) : (
                  <>
                    <ChartContainer
                      config={agentPerfChartConfig}
                      className='h-[280px] w-full'
                    >
                      <BarChart
                        data={agentPerfBarData}
                        layout='vertical'
                        margin={{ left: 20, right: 20 }}
                      >
                        <CartesianGrid horizontal={false} />
                        <YAxis
                          dataKey='name'
                          type='category'
                          tickLine={false}
                          axisLine={false}
                          width={100}
                          tick={{ fontSize: 12 }}
                        />
                        <XAxis
                          type='number'
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <ChartTooltip
                          cursor={{ fill: 'var(--primary)', opacity: 0.1 }}
                          content={<ChartTooltipContent />}
                        />
                        <Bar
                          dataKey='attempts'
                          fill='var(--chart-1)'
                          radius={[0, 4, 4, 0]}
                          barSize={16}
                        />
                        <Bar
                          dataKey='connected'
                          fill='var(--chart-2)'
                          radius={[0, 4, 4, 0]}
                          barSize={16}
                        />
                      </BarChart>
                    </ChartContainer>
                    {/* Agent details list */}
                    <div className='mt-4 space-y-2'>
                      {agents.map((a) => (
                        <div
                          key={a.agentUserId}
                          className='flex items-center justify-between rounded-md border px-3 py-2 text-sm'
                        >
                          <span className='font-medium'>
                            {getAgentName(a.agentUserId)}
                          </span>
                          <div className='text-muted-foreground flex gap-4 text-xs'>
                            <span>
                              {t('agentPerformance.calls', {
                                count: a.attempts
                              })}
                            </span>
                            <span>
                              {t('agentPerformance.rate', {
                                rate: Math.round(a.contactRate)
                              })}
                            </span>
                            <span>
                              {t('agentPerformance.talk', {
                                time: formatTime(a.totalTalkSec)
                              })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Chart Row 2: Dispositions by Agent */}
          <Card>
            <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <CardTitle>{t('byAgent.title')}</CardTitle>
                <CardDescription>{t('byAgent.description')}</CardDescription>
              </div>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className='w-full sm:w-[200px]'>
                  <SelectValue placeholder={t('byAgent.allAgents')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>{t('byAgent.allAgents')}</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.agentUserId} value={a.agentUserId}>
                      {getAgentName(a.agentUserId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {agentDispositionBarData.length === 0 ? (
                <p className='text-muted-foreground py-12 text-center text-sm'>
                  {t('byAgent.empty')}
                </p>
              ) : (
                <ChartContainer
                  config={barChartConfig}
                  className='h-[300px] w-full'
                >
                  <BarChart
                    data={agentDispositionBarData}
                    margin={{ left: 12, right: 12, bottom: 40 }}
                  >
                    <defs>
                      <linearGradient id='fillDisp' x1='0' y1='0' x2='0' y2='1'>
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
                      dataKey='label'
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      angle={-35}
                      textAnchor='end'
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <ChartTooltip
                      cursor={{ fill: 'var(--primary)', opacity: 0.1 }}
                      content={<ChartTooltipContent />}
                    />
                    <Bar
                      dataKey='count'
                      fill='url(#fillDisp)'
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
