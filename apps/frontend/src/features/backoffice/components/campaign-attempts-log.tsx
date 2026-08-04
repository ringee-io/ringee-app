'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { useBackofficeApi, type CampaignAttemptRow } from '../api';
import type { DateRange } from '../lib/date-presets';
import {
  errorMessage,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber
} from '../lib/format';

const PAGE_SIZE = 25;

/** The raw call log — every dial the campaign made inside the range. */
export function CampaignAttemptsLog({
  id,
  range
}: {
  id: string;
  range: DateRange;
}) {
  const api = useBackofficeApi();
  const [items, setItems] = useState<CampaignAttemptRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // A new range restarts the log from the first page.
  useEffect(() => {
    setPage(1);
  }, [range]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listCampaignAttempts(id, {
        start: range.start,
        end: range.end,
        page,
        pageSize: PAGE_SIZE
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load call log'));
    } finally {
      setLoading(false);
    }
  }, [api, id, range, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
      <CardHeader className='px-4 sm:px-6'>
        <CardTitle>
          Call log{total > 0 ? ` (${formatNumber(total)})` : ''}
        </CardTitle>
        <CardDescription>
          Every dial attempt in this range, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4 px-4 sm:px-6'>
        <div className='overflow-x-auto'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Disposition</TableHead>
                <TableHead className='text-right'>Try</TableHead>
                <TableHead className='text-right'>Duration</TableHead>
                <TableHead className='text-right'>Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className='text-muted-foreground py-8 text-center'
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className='text-muted-foreground py-8 text-center'
                  >
                    No calls in this range.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>
                      {formatDateTime(a.initiatedAt)}
                    </TableCell>
                    <TableCell>
                      <span className='block'>{a.contactName ?? '—'}</span>
                      <span className='text-muted-foreground block text-xs'>
                        {a.contactPhone ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell className='text-sm'>{a.agentName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={a.answeredAt ? 'default' : 'outline'}
                        className={a.answeredAt ? '' : 'opacity-70'}
                      >
                        {a.answeredAt ? 'answered' : a.status}
                      </Badge>
                      {a.hangupCause && (
                        <span className='text-muted-foreground block text-xs'>
                          {a.hangupCause}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className='text-sm'>
                      {a.dispositionCode ?? '—'}
                    </TableCell>
                    <TableCell className='text-right'>
                      {a.attemptNumber}
                    </TableCell>
                    <TableCell className='text-right'>
                      {a.durationSec ? formatDuration(a.durationSec) : '—'}
                    </TableCell>
                    <TableCell className='text-right'>
                      {a.cost === null ? '—' : formatMoney(a.cost)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
