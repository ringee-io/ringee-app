'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { CallDetailDialog } from '@/features/call-detail';
import { CallListRowActions } from '@/features/calls/components/call-list-row-actions';

/** Call history for one agent (§17). */
export function CallsTable({
  agentId,
  refreshKey
}: {
  agentId: string;
  refreshKey?: number;
}) {
  const t = useTranslations('aiVoiceAgents.calls');
  const tCommon = useTranslations('aiVoiceAgents.common');
  const tGlobal = useTranslations('common');
  const api = useVoiceAgentApi();
  const [calls, setCalls] = useState<VoiceAgentCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const page = await api.listCalls(agentId);
      setCalls(page.data);
    } catch (error) {
      setFailure(describeApiError(error, t('loadError')));
    } finally {
      setLoading(false);
    }
  }, [api, agentId, t]);

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
          {tCommon('tryAgain')}
        </Button>
      </Card>
    );
  }

  if (calls.length === 0) {
    return (
      <Card className='text-muted-foreground rounded-lg py-10 text-center text-sm'>
        {t('empty')}
      </Card>
    );
  }

  return (
    <>
      <CallDetailDialog
        callId={selectedCallId}
        onClose={() => setSelectedCallId(null)}
        closeLabel={tCommon('back')}
        description={t('detailDescription')}
      />

      <Card className='overflow-x-auto rounded-lg p-0'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('phone')}</TableHead>
              <TableHead>{t('started')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead>{t('outcome')}</TableHead>
              <TableHead>{t('summary')}</TableHead>
              <TableHead className='w-12'>
                <span className='sr-only'>{tGlobal('actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((call) => (
              <TableRow key={call.id}>
                <TableCell className='font-medium'>{call.toNumber}</TableCell>
                <TableCell>
                  {new Date(call.createdAt).toLocaleString()}
                </TableCell>
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
                      {t.has(`outcomes.${call.outcome}`)
                        ? t(`outcomes.${call.outcome}`)
                        : call.outcome}
                    </Badge>
                  ) : (
                    <span className='text-muted-foreground'>—</span>
                  )}
                </TableCell>
                <TableCell className='text-muted-foreground max-w-md truncate text-sm'>
                  {call.summary ?? '—'}
                </TableCell>
                <TableCell className='text-right'>
                  {call.callId ? (
                    <CallListRowActions
                      callId={call.callId}
                      callFrom={call.fromNumber}
                      callTo={call.toNumber}
                      phoneNumber={call.toNumber}
                      onView={() => setSelectedCallId(call.callId)}
                    />
                  ) : (
                    <span className='text-muted-foreground'>—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
