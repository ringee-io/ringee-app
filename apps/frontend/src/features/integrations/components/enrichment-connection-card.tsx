'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { AlertCircle, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useEnrichmentMutations } from '../hooks/use-enrichment-connections';
import {
  ENRICHMENT_PROVIDER_META,
  type EnrichmentConnectionSummary
} from '../types/enrichment';

interface Props {
  connection: EnrichmentConnectionSummary;
  onChange: () => void;
}

export function EnrichmentConnectionCard({ connection, onChange }: Props) {
  const meta = ENRICHMENT_PROVIDER_META[connection.provider];
  const { disconnect } = useEnrichmentMutations();
  const t = useTranslations('integrations.enrichment.card');
  const [busy, setBusy] = useState(false);

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await disconnect(connection.id);
      toast.success(t('disconnected', { provider: meta.name }));
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('disconnectError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='flex items-center justify-between text-base'>
          <span className='flex items-center gap-2'>
            <span
              className='inline-block h-2.5 w-2.5 rounded-full'
              style={{ backgroundColor: meta.color }}
            />
            {meta.name}
          </span>
          <StatusBadge status={connection.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>
        <div className='text-muted-foreground'>
          {connection.externalAccountName ?? connection.externalAccountId}
        </div>
        {connection.status === 'error' && connection.lastErrorCode && (
          <div className='flex items-center gap-2 text-amber-700'>
            <AlertCircle className='h-4 w-4' />
            <span>{connection.lastErrorCode}</span>
          </div>
        )}
        <div className='flex flex-wrap gap-2 text-xs'>
          {connection.capabilities?.byEmail && (
            <Badge variant='secondary'>{t('capabilities.byEmail')}</Badge>
          )}
          {connection.capabilities?.byLinkedIn && (
            <Badge variant='secondary'>{t('capabilities.byLinkedIn')}</Badge>
          )}
          {connection.capabilities?.byNameCompany && (
            <Badge variant='secondary'>{t('capabilities.byNameCompany')}</Badge>
          )}
          {connection.capabilities?.byDomain && (
            <Badge variant='secondary'>{t('capabilities.byDomain')}</Badge>
          )}
          {connection.capabilities?.leadSearch && (
            <Badge className='gap-1'>
              <Sparkles className='h-3 w-3' />
              {t('capabilities.leadSearch')}
            </Badge>
          )}
        </div>
        <div className='flex justify-end pt-2'>
          <Button
            size='sm'
            variant='ghost'
            onClick={handleDisconnect}
            disabled={busy}
            className='text-destructive hover:text-destructive'
          >
            <Trash2 className='mr-1 h-4 w-4' />
            {t('disconnect')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  status
}: {
  status: EnrichmentConnectionSummary['status'];
}) {
  const t = useTranslations('integrations.enrichment.card.status');
  switch (status) {
    case 'active':
      return <Badge variant='default'>{t('active')}</Badge>;
    case 'error':
      return <Badge variant='destructive'>{t('error')}</Badge>;
    case 'disconnected':
      return <Badge variant='outline'>{t('disconnected')}</Badge>;
  }
}
