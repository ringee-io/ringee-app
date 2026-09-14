'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Eye, Filter } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { DropdownMenuItem } from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import {
  TableActionCell,
  TableActionHead
} from '@ringee/frontend-shared/components/ui/table/table-action-column';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import { DateRangeBar } from './date-range-bar';
import { AccountFilterBar } from './account-filter-bar';
import { VoiceAgentCallsLog } from './voice-agent-calls-log';
import {
  useBackofficeApi,
  type ActivityAccountRow,
  type BackofficeActivity
} from '../api';
import { rangeForPreset, type DateRange } from '../lib/date-presets';
import {
  NO_ACCOUNT_FILTER,
  PERSONAL_ORGANIZATION_ID,
  accountFilterParams,
  type AccountFilter
} from '../lib/account-filter';
import {
  errorMessage,
  formatDateTime,
  formatMoney,
  formatMoneyPrecise,
  formatNumber
} from '../lib/format';

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

/** A count with the part of it an AI agent produced underneath. */
function CountWithDetail({ value, detail }: { value: number; detail: string }) {
  return (
    <>
      {formatNumber(value)}
      <span className='text-muted-foreground block text-xs'>{detail}</span>
    </>
  );
}

/** The page filter that narrows everything to exactly this row's account. */
function filterForRow(row: ActivityAccountRow): AccountFilter {
  return {
    client: { id: row.userId, name: row.userEmail || row.userName },
    organization: row.organizationId
      ? {
          id: row.organizationId,
          name: row.organizationName ?? row.organizationId
        }
      : { id: PERSONAL_ORGANIZATION_ID, name: 'Personal (no organization)' }
  };
}

function AccountIdentity({ row }: { row: ActivityAccountRow }) {
  return (
    <div className='min-w-0'>
      <Link
        href={`/backoffice/accounts/user/${row.userId}`}
        className='block truncate font-medium hover:underline'
      >
        {row.userName}
      </Link>
      {row.userEmail && row.userEmail !== row.userName && (
        <span className='text-muted-foreground block truncate text-xs'>
          {row.userEmail}
        </span>
      )}
    </div>
  );
}

function OrganizationIdentity({ row }: { row: ActivityAccountRow }) {
  if (!row.organizationId) {
    return <span className='text-muted-foreground text-sm'>Personal</span>;
  }
  return (
    <Link
      href={`/backoffice/accounts/org/${row.organizationId}`}
      className='block truncate text-sm hover:underline'
    >
      {row.organizationName}
    </Link>
  );
}

function AccountsTable({
  rows,
  loading,
  failed,
  onRetry,
  onFilter
}: {
  rows: ActivityAccountRow[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onFilter: (row: ActivityAccountRow) => void;
}) {
  const placeholder =
    loading && rows.length === 0 ? (
      'Loading…'
    ) : failed && rows.length === 0 ? (
      <span className='flex flex-col items-center gap-2'>
        Could not load activity.
        <Button size='sm' variant='outline' onClick={onRetry}>
          Retry
        </Button>
      </span>
    ) : rows.length === 0 ? (
      'No meetings, callbacks or AI voice agent calls in this range.'
    ) : null;

  const key = (r: ActivityAccountRow) =>
    `${r.userId}-${r.organizationId ?? 'personal'}`;

  return (
    <>
      <div className='hidden xl:block'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead className='text-right'>Meetings</TableHead>
              <TableHead className='text-right'>Callbacks</TableHead>
              <TableHead className='text-right'>AI calls</TableHead>
              <TableHead className='text-right'>AI meetings</TableHead>
              <TableHead className='text-right'>AI reminders</TableHead>
              <TableHead className='text-right'>AI cost</TableHead>
              <TableHead className='text-right'>Last activity</TableHead>
              <TableActionHead>
                <span className='sr-only'>Actions</span>
              </TableActionHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {placeholder ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className='text-muted-foreground py-8 text-center'
                >
                  {placeholder}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={key(r)}>
                  <TableCell className='max-w-56'>
                    <AccountIdentity row={r} />
                  </TableCell>
                  <TableCell className='max-w-48'>
                    <OrganizationIdentity row={r} />
                  </TableCell>
                  <TableCell className='text-right'>
                    <CountWithDetail
                      value={r.meetings}
                      detail={`${formatNumber(r.meetingsByAgents)} by AI`}
                    />
                  </TableCell>
                  <TableCell className='text-right'>
                    <CountWithDetail
                      value={r.callbacks}
                      detail={`${formatNumber(r.callbacksByAgents)} by AI`}
                    />
                  </TableCell>
                  <TableCell className='text-right'>
                    <CountWithDetail
                      value={r.agentCalls}
                      detail={`${formatNumber(r.agentCallsConnected)} connected`}
                    />
                  </TableCell>
                  <TableCell className='text-right'>
                    <CountWithDetail
                      value={r.agentMeetingsBooked}
                      detail={`of ${formatNumber(r.bookingCalls)} booking calls`}
                    />
                  </TableCell>
                  <TableCell className='text-right'>
                    <CountWithDetail
                      value={r.reminderCalls}
                      detail={`${formatNumber(r.remindersConfirmed)} confirmed`}
                    />
                  </TableCell>
                  <TableCell className='text-right'>
                    {formatMoney(r.agentTotalCost)}
                    <span className='text-muted-foreground block text-xs'>
                      voice {formatMoney(r.agentVoiceCost)} · AI{' '}
                      {formatMoney(r.agentAiCost)}
                    </span>
                    {r.agentCostPending > 0 && (
                      <span className='text-muted-foreground block text-xs'>
                        {formatNumber(r.agentCostPending)} pending
                      </span>
                    )}
                  </TableCell>
                  <TableCell className='text-muted-foreground text-right text-xs'>
                    {formatDateTime(r.lastActivityAt)}
                  </TableCell>
                  <TableActionCell>
                    <TableRowActions
                      label='Open actions menu'
                      menuLabel='Actions'
                    >
                      <DropdownMenuItem asChild>
                        <Link href={`/backoffice/accounts/user/${r.userId}`}>
                          <Eye className='size-4' />
                          View user
                        </Link>
                      </DropdownMenuItem>
                      {r.organizationId && (
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/backoffice/accounts/org/${r.organizationId}`}
                          >
                            <Building2 className='size-4' />
                            View organization
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onFilter(r)}>
                        <Filter className='size-4' />
                        Filter by this account
                      </DropdownMenuItem>
                    </TableRowActions>
                  </TableActionCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className='divide-y xl:hidden'>
        {placeholder ? (
          <div className='text-muted-foreground py-8 text-center text-sm'>
            {placeholder}
          </div>
        ) : (
          rows.map((r) => (
            <div key={key(r)} className='space-y-3 py-4'>
              <div className='flex min-w-0 items-start justify-between gap-3'>
                <div className='min-w-0'>
                  <AccountIdentity row={r} />
                  <OrganizationIdentity row={r} />
                </div>
                <Button
                  size='sm'
                  variant='outline'
                  className='shrink-0'
                  onClick={() => onFilter(r)}
                >
                  <Filter className='size-4' />
                  Filter
                </Button>
              </div>
              <dl className='grid grid-cols-3 gap-3 text-sm'>
                <div>
                  <dt className='text-muted-foreground text-xs'>Meetings</dt>
                  <dd>
                    <CountWithDetail
                      value={r.meetings}
                      detail={`${formatNumber(r.meetingsByAgents)} by AI`}
                    />
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground text-xs'>Callbacks</dt>
                  <dd>
                    <CountWithDetail
                      value={r.callbacks}
                      detail={`${formatNumber(r.callbacksByAgents)} by AI`}
                    />
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground text-xs'>AI calls</dt>
                  <dd>{formatNumber(r.agentCalls)}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground text-xs'>AI meetings</dt>
                  <dd>{formatNumber(r.agentMeetingsBooked)}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground text-xs'>
                    AI reminders
                  </dt>
                  <dd>{formatNumber(r.reminderCalls)}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground text-xs'>AI cost</dt>
                  <dd>{formatMoney(r.agentTotalCost)}</dd>
                </div>
              </dl>
              <p className='text-muted-foreground text-xs'>
                Last activity {formatDateTime(r.lastActivityAt)}
              </p>
            </div>
          ))
        )}
      </div>
    </>
  );
}

export function ActivityOverview() {
  const api = useBackofficeApi();
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('today'));
  const [data, setData] = useState<BackofficeActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [accountFilter, setAccountFilter] =
    useState<AccountFilter>(NO_ACCOUNT_FILTER);
  const { userId, organizationId } = accountFilterParams(accountFilter);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getActivity(range.start, range.end, { userId, organizationId })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setFailed(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setFailed(true);
        toast.error(errorMessage(err, 'Failed to load activity'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, range, userId, organizationId, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const filterByRow = useCallback(
    (row: ActivityAccountRow) => setAccountFilter(filterForRow(row)),
    []
  );

  const t = data?.totals;

  return (
    <div className='space-y-4 sm:space-y-6'>
      <div>
        <h1 className='text-xl font-semibold sm:text-2xl'>
          Meetings & AI agents
        </h1>
        <p className='text-muted-foreground text-sm'>
          Meetings and callbacks booked across every account, and what AI voice
          agents did and cost — by user and organization.
        </p>
      </div>

      <DateRangeBar value={range} onChange={setRange} />
      <AccountFilterBar value={accountFilter} onChange={setAccountFilter} />

      <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6'>
        <StatCard
          label='Meetings scheduled'
          value={t ? formatNumber(t.meetings) : '—'}
          hint={
            t
              ? `${formatNumber(t.meetingsByAgents)} by AI · ${formatNumber(t.meetingsCancelled)} cancelled`
              : undefined
          }
        />
        <StatCard
          label='Callbacks scheduled'
          value={t ? formatNumber(t.callbacks) : '—'}
          hint={t ? `${formatNumber(t.callbacksByAgents)} by AI` : undefined}
        />
        <StatCard
          label='AI voice agent calls'
          value={t ? formatNumber(t.agentCalls) : '—'}
          hint={
            t ? `${formatNumber(t.agentCallsConnected)} connected` : undefined
          }
        />
        <StatCard
          label='Meetings booked by AI'
          value={t ? formatNumber(t.agentMeetingsBooked) : '—'}
          hint={
            t ? `from ${formatNumber(t.bookingCalls)} booking calls` : undefined
          }
        />
        <StatCard
          label='AI reminders & notifications'
          value={t ? formatNumber(t.reminderCalls) : '—'}
          hint={
            t ? `${formatNumber(t.remindersConfirmed)} confirmed` : undefined
          }
        />
        <StatCard
          label='AI agent cost'
          value={t ? formatMoney(t.agentTotalCost) : '—'}
          hint={
            t
              ? `voice ${formatMoney(t.agentVoiceCost)} · AI ${formatMoney(t.agentAiCost)} (provider ${formatMoneyPrecise(t.agentAiProviderCostUsd)})` +
                (t.agentCostPending
                  ? ` · ${formatNumber(t.agentCostPending)} pending`
                  : '')
              : undefined
          }
        />
      </div>

      <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
        <CardHeader className='px-4 sm:px-6'>
          <CardTitle>By account</CardTitle>
          <CardDescription>
            Who booked them and for which organization. The same person appears
            once per workspace they worked in.
          </CardDescription>
        </CardHeader>
        <CardContent className='px-4 sm:px-6'>
          <AccountsTable
            rows={data?.accounts ?? []}
            loading={loading}
            failed={failed}
            onRetry={retry}
            onFilter={filterByRow}
          />
        </CardContent>
      </Card>

      <VoiceAgentCallsLog
        range={range}
        userId={userId}
        organizationId={organizationId}
      />
    </div>
  );
}
