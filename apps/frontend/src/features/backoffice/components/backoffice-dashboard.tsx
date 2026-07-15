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
    <Card className='gap-3 py-4 sm:gap-6 sm:py-6'>
      <CardHeader className='px-4 pb-0 sm:px-6 sm:pb-2'>
        <CardDescription className='text-xs sm:text-sm'>
          {label}
        </CardDescription>
        <CardTitle className='text-xl sm:text-2xl'>{value}</CardTitle>
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
    <>
      <div className='divide-y md:hidden'>
        {rows.map((r) => (
          <Link
            key={`${r.type}-${r.id}`}
            href={`/backoffice/accounts/${r.type}/${r.id}`}
            className='hover:bg-muted/50 focus-visible:ring-ring block rounded-md py-4 outline-none focus-visible:ring-2'
          >
            <span className='block font-medium'>{r.name}</span>
            {r.email && (
              <span className='text-muted-foreground block text-xs break-all'>
                {r.email}
              </span>
            )}
            <dl className='mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm'>
              <div>
                <dt className='text-muted-foreground text-xs'>Calls</dt>
                <dd>{formatNumber(r.calls)}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground text-xs'>Answered</dt>
                <dd>{formatNumber(r.answered)}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground text-xs'>Duration</dt>
                <dd>{formatDuration(r.totalDurationSec)}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground text-xs'>Cost</dt>
                <dd>{formatMoney(r.totalCost)}</dd>
              </div>
            </dl>
            <span className='text-muted-foreground mt-3 block text-xs'>
              Last call {formatDateTime(r.lastCallAt)}
            </span>
          </Link>
        ))}
      </div>

      <div className='hidden md:block'>
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
      </div>
    </>
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
    <div className='space-y-4 sm:space-y-6'>
      <div>
        <h1 className='text-xl font-semibold sm:text-2xl'>Dashboard</h1>
        <p className='text-muted-foreground text-sm'>
          Users and organizations with call activity.
        </p>
      </div>

      <DateRangeBar value={range} onChange={setRange} />

      <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'>
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

      <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
        <CardHeader className='px-4 sm:px-6'>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Agents who placed calls in this range.
          </CardDescription>
        </CardHeader>
        <CardContent className='px-4 sm:px-6'>
          {loading && !data ? (
            <p className='text-muted-foreground py-6 text-center text-sm'>
              Loading…
            </p>
          ) : (
            <ActivityTable rows={data?.users ?? []} />
          )}
        </CardContent>
      </Card>

      <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
        <CardHeader className='px-4 sm:px-6'>
          <CardTitle>Organizations</CardTitle>
          <CardDescription>
            Organizations with calls in this range.
          </CardDescription>
        </CardHeader>
        <CardContent className='px-4 sm:px-6'>
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
