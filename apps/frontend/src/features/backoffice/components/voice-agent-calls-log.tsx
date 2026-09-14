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
  Tabs,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import {
  useBackofficeApi,
  type VoiceAgentCallRow,
  type VoiceAgentCallsResult,
  type VoiceAgentTypeFilter
} from '../api';
import type { DateRange } from '../lib/date-presets';
import {
  errorMessage,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber
} from '../lib/format';

const PAGE_SIZE = 25;

const TYPE_TABS: { value: VoiceAgentTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'appointment_booking', label: 'Booking' },
  { value: 'reminders_notifications', label: 'Reminders' }
];

const AGENT_TYPE_LABEL: Record<string, string> = {
  appointment_booking: 'Appointment booking',
  reminders_notifications: 'Reminders & notifications'
};

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  completed: 'default',
  no_answer: 'secondary',
  busy: 'secondary',
  voicemail: 'secondary',
  failed: 'destructive'
};

const OUTCOME_VARIANT: Record<string, BadgeVariant> = {
  meeting_booked: 'default',
  appointment_booked: 'default',
  confirmed: 'default',
  callback_scheduled: 'secondary',
  callback_requested: 'secondary',
  cannot_attend: 'destructive',
  not_interested: 'destructive',
  wrong_number: 'destructive'
};

function humanize(value: string): string {
  return value.replace(/_/g, ' ');
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>
      {humanize(status)}
    </Badge>
  );
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className='text-muted-foreground'>—</span>;
  return (
    <Badge variant={OUTCOME_VARIANT[outcome] ?? 'outline'}>
      {humanize(outcome)}
    </Badge>
  );
}

function CostCell({ call }: { call: VoiceAgentCallRow }) {
  return (
    <div className='text-right'>
      <span>{formatMoney(call.totalCost)}</span>
      <span className='text-muted-foreground block text-xs'>
        voice {call.voiceCost == null ? '—' : formatMoney(call.voiceCost)} · AI{' '}
        {call.aiCost == null ? '—' : formatMoney(call.aiCost)}
      </span>
      {call.costPending && (
        <Badge variant='outline' className='mt-1'>
          cost pending
        </Badge>
      )}
    </div>
  );
}

function AccountCell({ call }: { call: VoiceAgentCallRow }) {
  return (
    <div className='min-w-0'>
      <Link
        href={`/backoffice/accounts/user/${call.userId}`}
        className='block truncate text-sm hover:underline'
      >
        {call.userEmail || call.userName}
      </Link>
      {call.organizationId ? (
        <Link
          href={`/backoffice/accounts/org/${call.organizationId}`}
          className='text-muted-foreground block truncate text-xs hover:underline'
        >
          {call.organizationName}
        </Link>
      ) : (
        <span className='text-muted-foreground block text-xs'>Personal</span>
      )}
    </div>
  );
}

function MeetingNote({ call }: { call: VoiceAgentCallRow }) {
  if (!call.meetingScheduledAt) return null;
  return (
    <span className='text-muted-foreground block text-xs'>
      Meeting {formatDateTime(call.meetingScheduledAt)}
    </span>
  );
}

export function VoiceAgentCallsLog({
  range,
  userId,
  organizationId
}: {
  range: DateRange;
  userId?: string;
  /** An organization id, or 'none' for personal (no organization) calls. */
  organizationId?: string;
}) {
  const api = useBackofficeApi();
  const [type, setType] = useState<VoiceAgentTypeFilter>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<VoiceAgentCallsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // A new range or account starts again from the first page. Reset during
  // render, not in an effect, so the stale page is never fetched first.
  const filterKey = [
    range.start.getTime(),
    range.end.getTime(),
    userId,
    organizationId
  ].join('|');
  const [pageFilterKey, setPageFilterKey] = useState(filterKey);
  if (pageFilterKey !== filterKey) {
    setPageFilterKey(filterKey);
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listVoiceAgentCalls({
        start: range.start,
        end: range.end,
        type,
        userId,
        organizationId,
        page,
        pageSize: PAGE_SIZE
      })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setFailed(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setFailed(true);
        toast.error(errorMessage(err, 'Failed to load AI voice agent calls'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, range, type, userId, organizationId, page, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const placeholder =
    loading && items.length === 0 ? (
      'Loading…'
    ) : failed && items.length === 0 ? (
      <span className='flex flex-col items-center gap-2'>
        Could not load AI voice agent calls.
        <Button size='sm' variant='outline' onClick={retry}>
          Retry
        </Button>
      </span>
    ) : items.length === 0 ? (
      'No AI voice agent calls in this range.'
    ) : null;

  return (
    <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
      <CardHeader className='flex flex-col gap-3 px-4 sm:px-6'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <CardTitle>
              {total > 0
                ? `${formatNumber(total)} AI voice agent calls`
                : 'AI voice agent calls'}
            </CardTitle>
            <CardDescription>
              Every call an agent placed, who it was for and what it cost.
            </CardDescription>
          </div>
          <Tabs
            className='w-full sm:w-auto'
            value={type}
            onValueChange={(v) => {
              setType(v as VoiceAgentTypeFilter);
              setPage(1);
            }}
          >
            <TabsList className='w-full sm:w-fit'>
              {TYPE_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent className='space-y-4 px-4 sm:px-6'>
        <div className='hidden xl:block'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className='text-right'>Duration</TableHead>
                <TableHead className='text-right'>Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {placeholder ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className='text-muted-foreground py-8 text-center'
                  >
                    {placeholder}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className='text-muted-foreground text-xs'>
                      {formatDateTime(call.createdAt)}
                    </TableCell>
                    <TableCell>
                      <span className='font-medium'>{call.agentName}</span>
                      <span className='text-muted-foreground block text-xs'>
                        {AGENT_TYPE_LABEL[call.agentType] ??
                          humanize(call.agentType)}
                      </span>
                    </TableCell>
                    <TableCell className='max-w-56'>
                      <AccountCell call={call} />
                    </TableCell>
                    <TableCell className='text-sm'>{call.toNumber}</TableCell>
                    <TableCell>
                      <StatusBadge status={call.status} />
                    </TableCell>
                    <TableCell>
                      <OutcomeBadge outcome={call.outcome} />
                      <MeetingNote call={call} />
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatDuration(call.durationSec ?? 0)}
                    </TableCell>
                    <TableCell>
                      <CostCell call={call} />
                    </TableCell>
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
            items.map((call) => (
              <div key={call.id} className='space-y-3 py-4'>
                <div className='flex min-w-0 items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <p className='truncate font-medium'>{call.agentName}</p>
                    <p className='text-muted-foreground truncate text-xs'>
                      {AGENT_TYPE_LABEL[call.agentType] ??
                        humanize(call.agentType)}{' '}
                      · {formatDateTime(call.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={call.status} />
                </div>
                <AccountCell call={call} />
                <dl className='grid grid-cols-3 gap-3 text-sm'>
                  <div className='min-w-0'>
                    <dt className='text-muted-foreground text-xs'>To</dt>
                    <dd className='truncate'>{call.toNumber}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground text-xs'>Duration</dt>
                    <dd>{formatDuration(call.durationSec ?? 0)}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground text-xs'>Cost</dt>
                    <dd>
                      {formatMoney(call.totalCost)}
                      {call.costPending && (
                        <span className='text-muted-foreground block text-xs'>
                          pending
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
                <div>
                  <OutcomeBadge outcome={call.outcome} />
                  <MeetingNote call={call} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className='flex flex-wrap items-center justify-between gap-3'>
          <span className='text-muted-foreground text-sm'>
            Page {page} of {totalPages}
          </span>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
            >
              Previous
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
