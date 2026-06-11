'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  RefreshCw,
  XCircle,
  Link2
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useConnectionSyncs } from '../../hooks/use-crm-connections';
import type { CrmCallSyncRow, CrmSyncStatus } from '../../types/crm';

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

export function SyncHistoryTab({ connectionId }: { connectionId: string }) {
  const api = useApi();
  const { syncs, loading, reload } = useConnectionSyncs(connectionId);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [resolveSync, setResolveSync] = useState<CrmCallSyncRow | null>(null);

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
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='text-sm font-semibold'>Call-log sync history</h3>
          <p className='text-muted-foreground text-xs'>
            Last 50 sync attempts. Failed or ambiguous syncs can be retried or
            resolved.
          </p>
        </div>
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

      {loading ? (
        <div className='space-y-2'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className='h-20 w-full' />
          ))}
        </div>
      ) : syncs.length === 0 ? (
        <div className='flex h-48 flex-col items-center justify-center text-center'>
          <Clock className='text-muted-foreground/40 h-10 w-10' />
          <p className='mt-3 text-sm font-medium'>No activity yet</p>
          <p className='text-muted-foreground mt-1 max-w-xs text-xs'>
            Call syncs will appear here once your first call is logged to the
            CRM.
          </p>
        </div>
      ) : (
        <div className='space-y-2'>
          {syncs.map((s) => (
            <SyncRow
              key={s.id}
              sync={s}
              onRetry={() => handleRetry(s.id)}
              onResolve={() => setResolveSync(s)}
              retrying={retryingId === s.id}
            />
          ))}
        </div>
      )}

      <ResolveMatchDialog
        sync={resolveSync}
        open={!!resolveSync}
        onOpenChange={(open) => !open && setResolveSync(null)}
        onResolved={() => {
          setResolveSync(null);
          reload();
        }}
      />
    </div>
  );
}

function SyncRow({
  sync,
  onRetry,
  onResolve,
  retrying
}: {
  sync: CrmCallSyncRow;
  onRetry: () => void;
  onResolve: () => void;
  retrying: boolean;
}) {
  const canRetry = sync.status === 'failed';
  const needsResolution = sync.status === 'needs_resolution';

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
        <div className='flex shrink-0 items-center gap-1.5'>
          {needsResolution && (
            <Button
              variant='outline'
              size='sm'
              className='h-7'
              onClick={onResolve}
            >
              <Link2 className='mr-1 h-3 w-3' />
              Resolve
            </Button>
          )}
          {canRetry && (
            <Button
              variant='outline'
              size='sm'
              className='h-7'
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
    </div>
  );
}

function ResolveMatchDialog({
  sync,
  open,
  onOpenChange,
  onResolved
}: {
  sync: CrmCallSyncRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}) {
  const api = useApi();
  const [externalId, setExternalId] = useState('');
  const [externalType, setExternalType] = useState<'person' | 'company'>(
    'person'
  );
  const [loading, setLoading] = useState(false);

  const handleResolve = async () => {
    if (!sync || !externalId.trim()) return;
    setLoading(true);
    try {
      await api.post(`/crm/syncs/${sync.id}/resolve`, {
        externalId: externalId.trim(),
        externalType
      });
      toast.success('Match resolved — sync will retry automatically');
      setExternalId('');
      onResolved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve ambiguous match</DialogTitle>
          <DialogDescription>
            Multiple CRM records matched this call. Provide the external ID of
            the correct record to link this call to.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {sync && (
            <div className='bg-muted/50 rounded-md p-3'>
              <p className='text-muted-foreground text-xs'>
                Call ID:{' '}
                <span className='font-mono'>{sync.callId.slice(0, 12)}…</span>
              </p>
              {sync.lastError && (
                <p className='mt-1 text-xs text-amber-600'>{sync.lastError}</p>
              )}
            </div>
          )}

          <div className='space-y-2'>
            <label className='text-sm font-medium'>Record Type</label>
            <div className='flex gap-2'>
              <Button
                variant={externalType === 'person' ? 'default' : 'outline'}
                size='sm'
                onClick={() => setExternalType('person')}
              >
                Person
              </Button>
              <Button
                variant={externalType === 'company' ? 'default' : 'outline'}
                size='sm'
                onClick={() => setExternalType('company')}
              >
                Company
              </Button>
            </div>
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-medium'>External Record ID</label>
            <Input
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder='Paste the CRM record ID here...'
              className='font-mono text-sm'
            />
            <p className='text-muted-foreground text-[11px]'>
              Find this in your CRM record&apos;s URL or details panel.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleResolve}
            disabled={!externalId.trim() || loading}
          >
            {loading ? (
              <Loader2 className='mr-2 h-3.5 w-3.5 animate-spin' />
            ) : null}
            Resolve & Retry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
