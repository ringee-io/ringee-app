'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
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
  type BackofficeDashboard as DashboardData,
  type CallerActivityRow
} from '../api';
import { rangeForPreset, type DateRange } from '../lib/date-presets';
import {
  errorMessage,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber
} from '../lib/format';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardDescription>{label}</CardDescription>
        <CardTitle className='text-2xl'>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function ActivityTable({ rows }: { rows: CallerActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <p className='text-muted-foreground py-6 text-center text-sm'>
        No call activity in this range.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className='text-right'>Calls</TableHead>
          <TableHead className='text-right'>Answered</TableHead>
          <TableHead className='text-right'>Duration</TableHead>
          <TableHead className='text-right'>Cost</TableHead>
          <TableHead className='text-right'>Last call</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.type}-${r.id}`}>
            <TableCell>
              <Link
                href={`/backoffice/accounts/${r.type}/${r.id}`}
                className='hover:underline'
              >
                <span className='font-medium'>{r.name}</span>
                {r.email && (
                  <span className='text-muted-foreground block text-xs'>
                    {r.email}
                  </span>
                )}
              </Link>
            </TableCell>
            <TableCell className='text-right'>
              {formatNumber(r.calls)}
            </TableCell>
            <TableCell className='text-right'>
              {formatNumber(r.answered)}
            </TableCell>
            <TableCell className='text-right'>
              {formatDuration(r.totalDurationSec)}
            </TableCell>
            <TableCell className='text-right'>
              {formatMoney(r.totalCost)}
            </TableCell>
            <TableCell className='text-muted-foreground text-right text-xs'>
              {formatDateTime(r.lastCallAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function BackofficeDashboard() {
  const api = useBackofficeApi();
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('30d'));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (r: DateRange) => {
      setLoading(true);
      try {
        const res = await api.getDashboard(r.start, r.end);
        setData(res);
      } catch (err) {
        toast.error(errorMessage(err, 'Failed to load dashboard'));
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    load(range);
  }, [load, range]);

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-semibold'>Dashboard</h1>
        <p className='text-muted-foreground text-sm'>
          Users and organizations with call activity.
        </p>
      </div>

      <DateRangeBar value={range} onChange={setRange} />

      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        <StatCard
          label='Total calls'
          value={data ? formatNumber(data.totals.calls) : '—'}
        />
        <StatCard
          label='Total cost'
          value={data ? formatMoney(data.totals.totalCost) : '—'}
        />
        <StatCard
          label='Active users'
          value={data ? formatNumber(data.totals.users) : '—'}
        />
        <StatCard
          label='Active orgs'
          value={data ? formatNumber(data.totals.organizations) : '—'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Agents who placed calls in this range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <p className='text-muted-foreground py-6 text-center text-sm'>
              Loading…
            </p>
          ) : (
            <ActivityTable rows={data?.users ?? []} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
          <CardDescription>
            Organizations with calls in this range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <p className='text-muted-foreground py-6 text-center text-sm'>
              Loading…
            </p>
          ) : (
            <ActivityTable rows={data?.organizations ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
