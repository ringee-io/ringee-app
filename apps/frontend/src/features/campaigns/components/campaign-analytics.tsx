'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ringee/frontend-shared/components/ui/card';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [campaignId]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const [s, d, a] = await Promise.all([
        api.get<AnalyticsSummary>(`/campaigns/${campaignId}/analytics/summary`),
        api.get<DispositionDist[]>(`/campaigns/${campaignId}/analytics/dispositions`),
        api.get<AgentPerf[]>(`/campaigns/${campaignId}/analytics/agents`),
      ]);
      setSummary(s);
      setDispositions(d);
      setAgents(a);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }

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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Disposition Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Disposition Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {dispositions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <div className="space-y-3">
                {dispositions.map((d) => (
                  <div key={d.code} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{d.label || d.code}</span>
                      <span className="text-muted-foreground">
                        {d.count} ({Math.round(d.percentage)}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="bg-primary h-full rounded-full transition-all"
                        style={{ width: `${d.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Agent Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <div className="space-y-3">
                {agents.map((a) => (
                  <div
                    key={a.userId}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">Agent</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        {a.userId.slice(0, 8)}...
                      </span>
                    </div>
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
    </div>
  );
}
