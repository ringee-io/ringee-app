'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@ringee/frontend-shared/components/ui/sheet';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  RefreshCw,
  XCircle
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useConnectionSyncs } from '../hooks/use-crm-connections';
import type { CrmCallSyncRow, CrmSyncStatus } from '../types/crm';

interface Props {
  connectionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_ICON: Record<CrmSyncStatus, React.ReactNode> = {
  done: <CheckCircle2 className='h-4 w-4 text-emerald-500' />,
  pending: <Clock className='text-muted-foreground h-4 w-4' />,
  in_progress: <Loader2 className='h-4 w-4 animate-spin text-sky-500' />,
  failed: <XCircle className='h-4 w-4 text-red-500' />,
  skipped: <AlertCircle className='text-muted-foreground h-4 w-4' />,
  needs_resolution: <HelpCircle className='h-4 w-4 text-amber-500' />
};

const STATUS_LABEL: Record<CrmSyncStatus, string> = {
  done: 'Synced',
  pending: 'Pending',
  in_progress: 'Running',
  failed: 'Failed',
  skipped: 'Skipped',
  needs_resolution: 'Needs review'
};

export function SyncHistorySheet({ connectionId, open, onOpenChange }: Props) {
  const api = useApi();
  const { syncs, loading, reload } = useConnectionSyncs(
    open ? connectionId : null
  );
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      await api.post(`/crm/syncs/${id}/retry`);
      toast.success('Sync queued for retry');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>Sync history</SheetTitle>
          <SheetDescription>
            The last 50 call-log sync attempts for this connection. Failed syncs
            can be retried manually.
          </SheetDescription>
        </SheetHeader>

        <div className='mt-4 flex h-[calc(100vh-8rem)] flex-col'>
          <div className='mb-3 flex items-center justify-between'>
            <span className='text-muted-foreground text-xs'>
              {loading ? 'Loading…' : `${syncs.length} events`}
            </span>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => reload()}
              disabled={loading}
              className='h-7'
            >
              <RefreshCw
                className={cn('mr-1.5 h-3 w-3', loading && 'animate-spin')}
              />
              Refresh
            </Button>
          </div>

          <ScrollArea className='flex-1 pr-3'>
            {loading ? (
              <div className='space-y-2'>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className='h-20 w-full' />
                ))}
              </div>
            ) : syncs.length === 0 ? (
              <div className='flex h-64 flex-col items-center justify-center text-center'>
                <Clock className='text-muted-foreground/40 h-10 w-10' />
                <p className='mt-3 text-sm font-medium'>No activity yet</p>
                <p className='text-muted-foreground mt-1 max-w-xs text-xs'>
                  Call syncs will appear here as soon as your first call is
                  logged to the CRM.
                </p>
              </div>
            ) : (
              <div className='space-y-2'>
                {syncs.map((s) => (
                  <SyncRow
                    key={s.id}
                    sync={s}
                    onRetry={() => handleRetry(s.id)}
                    retrying={retryingId === s.id}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SyncRow({
  sync,
  onRetry,
  retrying
}: {
  sync: CrmCallSyncRow;
  onRetry: () => void;
  retrying: boolean;
}) {
  const canRetry =
    sync.status === 'failed' || sync.status === 'needs_resolution';
  return (
    <div className='bg-card rounded-md border p-3 text-sm'>
      <div className='flex items-start justify-between gap-2'>
        <div className='flex items-start gap-2'>
          <div className='mt-0.5'>{STATUS_ICON[sync.status]}</div>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <Badge
                variant='outline'
                className='h-5 px-1.5 text-[10px] font-normal'
              >
                {STATUS_LABEL[sync.status]}
              </Badge>
              <span className='text-muted-foreground text-xs'>
                attempt {sync.attemptCount}
              </span>
            </div>
            <p className='text-muted-foreground mt-1 truncate font-mono text-[11px]'>
              call {sync.callId.slice(0, 8)}… ·{' '}
              {new Date(sync.updatedAt).toLocaleString()}
            </p>
            {sync.externalActivityId && (
              <p className='mt-0.5 font-mono text-[11px] text-emerald-600/80'>
                Activity: {sync.externalActivityId.slice(0, 24)}…
              </p>
            )}
            {sync.lastError && (
              <p className='mt-1.5 rounded bg-red-500/5 p-1.5 text-[11px] text-red-600'>
                {sync.lastError}
              </p>
            )}
          </div>
        </div>
        {canRetry && (
          <Button
            variant='outline'
            size='sm'
            className='h-7 shrink-0'
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? (
              <Loader2 className='mr-1 h-3 w-3 animate-spin' />
            ) : (
              <RefreshCw className='mr-1 h-3 w-3' />
            )}
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
