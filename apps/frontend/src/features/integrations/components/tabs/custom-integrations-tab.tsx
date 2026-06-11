'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { AlertCircle, Plug, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomIntegrations } from '../../hooks/use-custom-integrations';
import type { CustomIntegrationSummary } from '../../types/custom-integrations';
import { CustomIntegrationCard } from '../custom-integration-card';
import { CustomIntegrationCreateDialog } from '../custom-integration-create-dialog';
import { CustomIntegrationDetailSheet } from '../custom-integration-detail-sheet';

export function CustomIntegrationsTab() {
  const { items, loading, error, reload, remove } = useCustomIntegrations();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const apiBaseUrl = useMemo(() => {
    const env = process.env.NEXT_PUBLIC_API_URL;
    if (env) return env.replace(/\/+$/, '').replace(/\/api$/, '');
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  }, []);

  const selected: CustomIntegrationSummary | null = useMemo(
    () => items.find((i) => i.id === detailId) ?? null,
    [items, detailId]
  );

  const handleDelete = async (id: string) => {
    try {
      await remove(id);
      if (detailId === id) setDetailId(null);
      toast.success('Integration deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex items-end justify-between gap-4'>
        <div>
          <h2 className='text-muted-foreground text-sm font-semibold tracking-wide uppercase'>
            Your custom integrations
          </h2>
          <p className='text-muted-foreground mt-1 max-w-2xl text-xs'>
            Connect Ringee to any external system using an API Key, webhooks,
            and click-to-call. Your system sends contacts and companies to
            Ringee; Ringee returns calls, outcomes, notes, callbacks, meetings,
            and recordings.
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => reload()}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <Button size='sm' onClick={() => setCreateOpen(true)}>
            <Plus className='mr-1.5 h-3.5 w-3.5' /> New custom integration
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Failed to load custom integrations</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : loading ? (
        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className='h-44 w-full rounded-xl' />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
          {items.map((item) => (
            <CustomIntegrationCard
              key={item.id}
              item={item}
              onConfigure={(id) => setDetailId(id)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <CustomIntegrationCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(item) => setDetailId(item.id)}
      />

      <CustomIntegrationDetailSheet
        item={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setDetailId(null)}
        apiBaseUrl={apiBaseUrl}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className='bg-muted/20 flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center'>
      <div className='bg-muted flex h-12 w-12 items-center justify-center rounded-full'>
        <Plug className='text-muted-foreground h-5 w-5' />
      </div>
      <h3 className='text-sm font-semibold'>No custom integrations yet</h3>
      <p className='text-muted-foreground max-w-sm text-xs'>
        Create one to expose an API Key, configure outbound webhooks, and start
        exchanging events.
      </p>
      <Button size='sm' onClick={onCreate}>
        <Plus className='mr-1.5 h-3.5 w-3.5' /> New custom integration
      </Button>
    </div>
  );
}
