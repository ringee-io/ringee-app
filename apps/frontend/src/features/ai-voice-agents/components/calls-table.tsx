'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card } from '@ringee/frontend-shared/components/ui/card';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import { useVoiceAgentApi } from '../api';
import { describeApiError } from '../lib/api-error';
import type { VoiceAgentCall } from '../types';

/** Readable labels for the closed outcome set (§18). */
const OUTCOME_LABELS: Record<string, string> = {
  appointment_booked: 'Appointment booked',
  confirmed: 'Confirmed',
  cannot_attend: 'Cannot attend',
  callback_requested: 'Callback requested',
  not_interested: 'Not interested',
  no_conversation: 'No conversation',
  unknown: 'Unknown'
};

/** Call history for one agent (§17). */
export function CallsTable({
  agentId,
  refreshKey
}: {
  agentId: string;
  refreshKey?: number;
}) {
  const api = useVoiceAgentApi();
  const [calls, setCalls] = useState<VoiceAgentCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const page = await api.listCalls(agentId);
      setCalls(page.data);
    } catch (error) {
      setFailure(describeApiError(error, 'Could not load this agent’s calls.'));
    } finally {
      setLoading(false);
    }
  }, [api, agentId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) return <Skeleton className='h-40 w-full rounded-lg' />;

  if (failure) {
    return (
      <Card className='flex flex-col items-center gap-3 rounded-lg py-10 text-center'>
        <AlertTriangle className='text-destructive size-5' />
        <p className='text-sm'>{failure}</p>
        <Button
          variant='outline'
          size='sm'
          className='rounded-lg'
          onClick={() => void load()}
        >
          <RotateCw className='size-3.5' />
          Try again
        </Button>
      </Card>
    );
  }

  if (calls.length === 0) {
    return (
      <Card className='text-muted-foreground rounded-lg py-10 text-center text-sm'>
        This agent has not called anyone yet.
      </Card>
    );
  }

  return (
    <Card className='overflow-x-auto rounded-lg p-0'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Phone</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>Summary</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calls.map((call) => (
            <TableRow key={call.id}>
              <TableCell className='font-medium'>{call.toNumber}</TableCell>
              <TableCell>{new Date(call.createdAt).toLocaleString()}</TableCell>
              <TableCell>
                <Badge variant='secondary' className='rounded-lg'>
                  {call.status}
                </Badge>
              </TableCell>
              <TableCell>
                {call.outcome ? (
                  <Badge
                    className='rounded-lg'
                    variant={
                      call.outcome === 'appointment_booked' ||
                      call.outcome === 'confirmed'
                        ? 'default'
                        : 'outline'
                    }
                  >
                    {OUTCOME_LABELS[call.outcome] ?? call.outcome}
                  </Badge>
                ) : (
                  <span className='text-muted-foreground'>—</span>
                )}
              </TableCell>
              <TableCell className='text-muted-foreground max-w-md truncate text-sm'>
                {call.summary ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
