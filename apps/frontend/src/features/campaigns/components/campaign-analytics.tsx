'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ringee/frontend-shared/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ringee/frontend-shared/components/ui/select';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
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
  Label,
} from 'recharts';
import { Phone, PhoneIncoming, Clock, TrendingUp } from 'lucide-react';

interface AnalyticsSummary {
  totalAttempts: number;
  totalAnswered: number;
  totalDispositioned: number;
  contactRate: number;
  avgDurationSec: number;
  totalTalkTimeSec: number;
}

interface DispositionDist {
  code: string;
  label: string | null;
  count: number;
  percentage: number;
}

interface AgentPerf {
  userId: string;
  attempts: number;
  connected: number;
  contactRate: number;
  avgDuration: number;
  totalTalkSec: number;
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
  '#10b981',
];

function formatTime(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

interface Props {
  campaignId: string;
}

export function CampaignAnalytics({ campaignId }: Props) {
  const api = useApi();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [dispositions, setDispositions] = useState<DispositionDist[]>([]);
  const [agents, setAgents] = useState<AgentPerf[]>([]);
  const [dispositionsByAgent, setDispositionsByAgent] = useState<DispositionByAgent[]>([]);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [campaignId]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const [s, d, a, dba, m] = await Promise.all([
        api.get<AnalyticsSummary>(`/campaigns/${campaignId}/analytics/summary`),
        api.get<DispositionDist[]>(`/campaigns/${campaignId}/analytics/dispositions`),
        api.get<AgentPerf[]>(`/campaigns/${campaignId}/analytics/agents`),
        api.get<DispositionByAgent[]>(`/campaigns/${campaignId}/analytics/dispositions-by-agent`),
        api.get<CampaignMember[]>(`/campaigns/${campaignId}/members`),
      ]);
      setSummary(s);
      setDispositions(d);
      setAgents(a);
      setDispositionsByAgent(dba);
      setMembers(m);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => {
      const name = `${m.user.firstName || ''} ${m.user.lastName || ''}`.trim() || 'Unknown';
      map.set(m.userId, name);
    });
    return map;
  }, [members]);

  function getAgentName(userId: string): string {
    return memberNameMap.get(userId) || userId?.slice(0, 8) + '...';
  }

  // Disposition pie chart data
  const pieData = useMemo(() => {
    return dispositions.map((d, i) => ({
      name: d.label || d.code,
      value: d.count,
      fill: DISPOSITION_COLORS[i % DISPOSITION_COLORS.length],
    }));
  }, [dispositions]);

  const pieChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    dispositions.forEach((d, i) => {
      config[d.code] = {
        label: d.label || d.code,
        color: DISPOSITION_COLORS[i % DISPOSITION_COLORS.length],
      };
    });
    return config;
  }, [dispositions]);

  // Filtered dispositions by agent for the bar chart
  const agentDispositionBarData = useMemo(() => {
    if (selectedAgent === 'all') {
      // Group all agents' data by disposition
      const byDisp = new Map<string, number>();
      dispositionsByAgent.forEach((d) => {
        byDisp.set(d.dispositionCode, (byDisp.get(d.dispositionCode) || 0) + d.count);
      });
      return Array.from(byDisp.entries())
        .map(([code, count]) => ({ dispositionCode: code, count }))
        .sort((a, b) => b.count - a.count);
    }
    return dispositionsByAgent
      .filter((d) => d.agentUserId === selectedAgent)
      .sort((a, b) => b.count - a.count);
  }, [dispositionsByAgent, selectedAgent]);

  const barChartConfig: ChartConfig = {
    count: {
      label: 'Count',
      color: 'var(--primary)',
    },
  };

  // Agent performance bar chart data
  const agentPerfBarData = useMemo(() => {
    return agents.map((a) => ({
      name: getAgentName(a.userId),
      attempts: a.attempts,
      connected: a.connected,
      contactRate: Math.round(a.contactRate * 100),
    }));
  }, [agents, memberNameMap]);

  const agentPerfChartConfig: ChartConfig = {
    attempts: {
      label: 'Attempts',
      color: 'var(--chart-1)',
    },
    connected: {
      label: 'Connected',
      color: 'var(--chart-2)',
    },
  };

  const totalDispositioned = useMemo(
    () => dispositions.reduce((sum, d) => sum + d.count, 0),
    [dispositions]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Total Calls</CardDescription>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalAttempts}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Connected</CardDescription>
              <PhoneIncoming className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalAnswered}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Contact Rate</CardDescription>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round(summary.contactRate * 100)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Avg Duration</CardDescription>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatTime(summary.avgDurationSec)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Row 1: Disposition Pie + Agent Performance Bar */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Disposition Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Disposition Distribution</CardTitle>
            <CardDescription>Breakdown of all call outcomes</CardDescription>
          </CardHeader>
          <CardContent>
            {dispositions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <ChartContainer config={pieChartConfig} className="mx-auto aspect-square h-[280px]">
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    strokeWidth={2}
                    stroke="var(--background)"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                    <Label
                      content={({ viewBox }) => {
                        if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                          return (
                            <text
                              x={viewBox.cx}
                              y={viewBox.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              <tspan
                                x={viewBox.cx}
                                y={viewBox.cy}
                                className="fill-foreground text-3xl font-bold"
                              >
                                {totalDispositioned}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) + 24}
                                className="fill-muted-foreground text-sm"
                              >
                                Dispositions
                              </tspan>
                            </text>
                          );
                        }
                      }}
                    />
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
            {/* Legend */}
            {dispositions.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {dispositions.map((d, i) => (
                  <div key={d.code} className="flex items-center gap-2 text-sm">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: DISPOSITION_COLORS[i % DISPOSITION_COLORS.length] }}
                    />
                    <span className="truncate text-muted-foreground">
                      {d.label || d.code}
                    </span>
                    <span className="ml-auto font-medium">{d.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Performance Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Agent Performance</CardTitle>
            <CardDescription>Attempts vs connected calls per agent</CardDescription>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <ChartContainer config={agentPerfChartConfig} className="h-[280px] w-full">
                <BarChart
                  data={agentPerfBarData}
                  layout="vertical"
                  margin={{ left: 20, right: 20 }}
                >
                  <CartesianGrid horizontal={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <ChartTooltip
                    cursor={{ fill: 'var(--primary)', opacity: 0.1 }}
                    content={<ChartTooltipContent />}
                  />
                  <Bar dataKey="attempts" fill="var(--chart-1)" radius={[0, 4, 4, 0]} barSize={16} />
                  <Bar dataKey="connected" fill="var(--chart-2)" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ChartContainer>
            )}
            {/* Agent details list */}
            {agents.length > 0 && (
              <div className="mt-4 space-y-2">
                {agents.map((a) => (
                  <div
                    key={a.userId}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{getAgentName(a.userId)}</span>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{a.attempts} calls</span>
                      <span>{Math.round(a.contactRate * 100)}% rate</span>
                      <span>{formatTime(a.totalTalkSec)} talk</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart Row 2: Dispositions by Agent */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Dispositions by Agent</CardTitle>
            <CardDescription>
              Disposition breakdown filtered by agent
            </CardDescription>
          </div>
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.userId} value={a.userId}>
                  {getAgentName(a.userId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {agentDispositionBarData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No disposition data available</p>
          ) : (
            <ChartContainer config={barChartConfig} className="h-[300px] w-full">
              <BarChart
                data={agentDispositionBarData}
                margin={{ left: 12, right: 12, bottom: 40 }}
              >
                <defs>
                  <linearGradient id="fillDisp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="dispositionCode"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  angle={-35}
                  textAnchor="end"
                  tick={{ fontSize: 11 }}
                />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip
                  cursor={{ fill: 'var(--primary)', opacity: 0.1 }}
                  content={<ChartTooltipContent />}
                />
                <Bar
                  dataKey="count"
                  fill="url(#fillDisp)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
