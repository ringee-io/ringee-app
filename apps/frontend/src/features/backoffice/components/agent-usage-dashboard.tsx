'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
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
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import { DateRangeBar } from './date-range-bar';
import {
  useBackofficeApi,
  type AgentAuthMethod,
  type AgentSurface,
  type AgentUsageStats
} from '../api';
import { rangeForPreset, type DateRange } from '../lib/date-presets';
import {
  errorMessage,
  formatDateTime,
  formatNumber,
  formatPercent
} from '../lib/format';

/**
 * Same validated pair as the campaign analytics (chart-1 / chart-2, fixed
 * order); chart-1 is under 3:1 on the dark surface, so the chart ships with a
 * table view of the same numbers.
 */
const chartConfig = {
  mcp: { label: 'MCP', color: 'var(--chart-1)' },
  cli: { label: 'CLI', color: 'var(--chart-2)' }
} satisfies ChartConfig;

const AUTH_LABEL: Record<AgentAuthMethod, string> = {
  api_key: 'API key',
  url: 'Legacy URL',
  oauth: 'OAuth (ChatGPT app)'
};

const SURFACE_LABEL: Record<AgentSurface, string> = { mcp: 'MCP', cli: 'CLI' };

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** One row per UTC day in the range, zero-filled, so gaps read as zero. */
function dailySeries(stats: AgentUsageStats) {
  const byDay = new Map<string, { mcp: number; cli: number }>();
  for (const row of stats.daily) {
    const key = utcDay(row.day);
    const entry = byDay.get(key) ?? { mcp: 0, cli: 0 };
    entry[row.surface] = row.users;
    byDay.set(key, entry);
  }
  const out: { day: string; label: string; mcp: number; cli: number }[] = [];
  const start = Date.parse(`${utcDay(stats.range.start)}T00:00:00Z`);
  const end = Date.parse(`${utcDay(stats.range.end)}T00:00:00Z`);
  for (let t = start; t <= end; t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({
      day,
      label: new Date(t).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
      }),
      ...(byDay.get(day) ?? { mcp: 0, cli: 0 })
    });
  }
  return out;
}

function StatCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className='gap-3 py-4 sm:gap-6 sm:py-6'>
      <CardHeader className='px-4 pb-0 sm:px-6 sm:pb-2'>
        <CardDescription className='text-xs sm:text-sm'>
          {label}
        </CardDescription>
        <CardTitle className='text-xl sm:text-2xl'>{value}</CardTitle>
        {hint && <p className='text-muted-foreground text-xs'>{hint}</p>}
      </CardHeader>
    </Card>
  );
}

function SectionCard({
  title,
  description,
  action,
  children
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
      <CardHeader className='flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent className='overflow-x-auto px-4 sm:px-6'>
        {children}
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className='text-muted-foreground py-6 text-center text-sm'>{children}</p>
  );
}

function errorRate(errors: number, calls: number): string {
  return calls ? formatPercent((errors / calls) * 100) : '—';
}

export function AgentUsageDashboard() {
  const api = useBackofficeApi();
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('30d'));
  const [data, setData] = useState<AgentUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);

  const load = useCallback(
    async (r: DateRange) => {
      setLoading(true);
      try {
        setData(await api.getAgentUsage(r.start, r.end));
      } catch (err) {
        toast.error(errorMessage(err, 'Failed to load MCP & CLI usage'));
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    void load(range);
  }, [load, range]);

  const daily = useMemo(() => (data ? dailySeries(data) : []), [data]);
  const totals = data?.totals;
  const hasActivity = Boolean(totals && totals.users > 0);

  return (
    <div className='space-y-4 sm:space-y-6'>
      <div>
        <h1 className='text-xl font-semibold sm:text-2xl'>MCP &amp; CLI</h1>
        <p className='text-muted-foreground text-sm'>
          Who connects AI clients and the ringee CLI, with what, and how much
          they use them.
        </p>
      </div>

      <DateRangeBar value={range} onChange={setRange} initialPreset='30d' />

      <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'>
        <StatCard
          label='Active users'
          value={totals ? formatNumber(totals.users) : '—'}
          hint='Used MCP or the CLI in range'
        />
        <StatCard
          label='CLI users'
          value={totals ? formatNumber(totals.cliUsers) : '—'}
        />
        <StatCard
          label='MCP users'
          value={totals ? formatNumber(totals.mcpUsers) : '—'}
          hint='Claude, Cursor, ChatGPT…'
        />
        <StatCard
          label='Tool calls'
          value={totals ? formatNumber(totals.toolCalls) : '—'}
          hint={
            totals
              ? `${errorRate(totals.toolErrors, totals.toolCalls)} failed`
              : undefined
          }
        />
        <StatCard
          label='CLI logins'
          value={totals ? formatNumber(totals.cliLogins.completed) : '—'}
          hint={
            totals
              ? `${formatNumber(totals.cliLogins.started)} started · ${formatNumber(totals.cliLogins.denied)} denied`
              : undefined
          }
        />
        <StatCard
          label='API keys created'
          value={
            totals
              ? formatNumber(
                  totals.apiKeysCreated.dashboard + totals.apiKeysCreated.cli
                )
              : '—'
          }
          hint={
            totals
              ? `${formatNumber(totals.apiKeysCreated.dashboard)} dashboard · ${formatNumber(totals.apiKeysCreated.cli)} CLI`
              : undefined
          }
        />
        <StatCard
          label='Active API keys'
          value={totals ? formatNumber(totals.activeApiKeys) : '—'}
          hint='All time, not revoked'
        />
        <StatCard
          label='Connections'
          value={totals ? formatNumber(totals.connects) : '—'}
          hint='MCP sessions initialized'
        />
      </div>

      <SectionCard
        title='Daily active users'
        description='Distinct users per UTC day. Someone using both counts once in each line.'
        action={
          hasActivity ? (
            <Button
              variant='outline'
              size='sm'
              onClick={() => setShowTable((v) => !v)}
            >
              {showTable ? 'Show chart' : 'Show table'}
            </Button>
          ) : undefined
        }
      >
        {loading && !data ? (
          <Skeleton className='h-[280px] w-full' />
        ) : !hasActivity ? (
          <Empty>No MCP or CLI activity in this range.</Empty>
        ) : showTable ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead className='text-right'>MCP users</TableHead>
                <TableHead className='text-right'>CLI users</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daily.map((d) => (
                <TableRow key={d.day}>
                  <TableCell>{d.label}</TableCell>
                  <TableCell className='text-right'>
                    {formatNumber(d.mcp)}
                  </TableCell>
                  <TableCell className='text-right'>
                    {formatNumber(d.cli)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <ChartContainer config={chartConfig} className='max-h-[300px] w-full'>
            <LineChart data={daily} margin={{ left: 4, right: 12 }}>
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
                width={32}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey='mcp'
                stroke='var(--color-mcp)'
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                dataKey='cli'
                stroke='var(--color-cli)'
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </SectionCard>

      <div className='grid gap-4 lg:grid-cols-2'>
        <SectionCard
          title='Clients'
          description='The MCP client name each connection introduced itself with.'
        >
          {!data?.clients.length ? (
            <Empty>No clients in this range.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className='text-right'>Users</TableHead>
                  <TableHead className='text-right'>Tool calls</TableHead>
                  <TableHead className='text-right'>Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.clients.map((c) => (
                  <TableRow key={`${c.surface}-${c.clientName ?? '-'}`}>
                    <TableCell>
                      <span className='font-mono text-xs'>
                        {c.clientName ?? 'unknown'}
                      </span>{' '}
                      <Badge variant='outline' className='ml-1 text-[10px]'>
                        {SURFACE_LABEL[c.surface]}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatNumber(c.users)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatNumber(c.toolCalls)}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-right text-xs'>
                      {formatDateTime(c.lastSeenAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <SectionCard
          title='Authentication'
          description='How connections authenticated. Legacy URLs should trend to zero.'
        >
          {!data?.authMethods.length ? (
            <Empty>No connections in this range.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className='text-right'>Users</TableHead>
                  <TableHead className='text-right'>Tool calls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.authMethods.map((a) => (
                  <TableRow key={a.authMethod}>
                    <TableCell>{AUTH_LABEL[a.authMethod]}</TableCell>
                    <TableCell className='text-right'>
                      {formatNumber(a.users)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatNumber(a.toolCalls)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title='Tools'
        description='Most-called tools across MCP and the CLI.'
      >
        {!data?.tools.length ? (
          <Empty>No tool calls in this range.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead className='text-right'>Calls</TableHead>
                <TableHead className='text-right'>Users</TableHead>
                <TableHead className='text-right'>Failed</TableHead>
                <TableHead className='text-right'>Avg time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.tools.map((tool) => (
                <TableRow key={tool.toolName}>
                  <TableCell className='font-mono text-xs'>
                    {tool.toolName}
                  </TableCell>
                  <TableCell className='text-right'>
                    {formatNumber(tool.calls)}
                  </TableCell>
                  <TableCell className='text-right'>
                    {formatNumber(tool.users)}
                  </TableCell>
                  <TableCell className='text-right'>
                    {errorRate(tool.errors, tool.calls)}
                  </TableCell>
                  <TableCell className='text-muted-foreground text-right text-xs'>
                    {tool.avgDurationMs == null
                      ? '—'
                      : `${formatNumber(tool.avgDurationMs)} ms`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard
        title='Users'
        description='Who used MCP or the CLI in this range, by tool calls.'
      >
        {!data?.users.length ? (
          <Empty>No users in this range.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Surfaces</TableHead>
                <TableHead>Clients</TableHead>
                <TableHead className='text-right'>Tool calls</TableHead>
                <TableHead className='text-right'>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((u) => {
                const name =
                  [u.firstName, u.lastName].filter(Boolean).join(' ') ||
                  u.email ||
                  u.userId;
                return (
                  <TableRow key={u.userId}>
                    <TableCell>
                      <Link
                        href={`/backoffice/accounts/user/${u.userId}`}
                        className='hover:underline'
                      >
                        <span className='font-medium'>{name}</span>
                        {u.email && u.email !== name && (
                          <span className='text-muted-foreground block text-xs'>
                            {u.email}
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className='flex gap-1'>
                        {u.surfaces.map((s) => (
                          <Badge
                            key={s}
                            variant='outline'
                            className='text-[10px]'
                          >
                            {SURFACE_LABEL[s]}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className='text-muted-foreground font-mono text-xs'>
                      {u.clients.join(', ') || '—'}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatNumber(u.toolCalls)}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-right text-xs'>
                      {formatDateTime(u.lastSeenAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
