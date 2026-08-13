'use client';

import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEnrichmentConnections } from '../../hooks/use-enrichment-connections';
import { EnrichmentConnectionCard } from '../enrichment-connection-card';
import { EnrichmentProviderCatalog } from '../enrichment-provider-catalog';

export function EnrichmentTab() {
  const { connections, loading, reload } = useEnrichmentConnections();
  const t = useTranslations('integrations.enrichment.tab');

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='flex items-center gap-2 text-lg font-semibold'>
          <Sparkles className='h-5 w-5' />
          {t('title')}
        </h2>
        <p className='text-muted-foreground text-sm'>{t('description')}</p>
      </div>

      <Alert>
        <AlertTitle>{t('billing.title')}</AlertTitle>
        <AlertDescription>{t('billing.description')}</AlertDescription>
      </Alert>

      {loading ? (
        <div className='space-y-3'>
          <Skeleton className='h-24 w-full' />
          <Skeleton className='h-24 w-full' />
        </div>
      ) : (
        <>
          {connections.length > 0 && (
            <div className='space-y-2'>
              <h3 className='text-muted-foreground text-sm font-medium'>
                {t('yourConnections')}
              </h3>
              <div className='grid gap-3 md:grid-cols-2'>
                {connections.map((c) => (
                  <EnrichmentConnectionCard
                    key={c.id}
                    connection={c}
                    onChange={reload}
                  />
                ))}
              </div>
            </div>
          )}

          <div className='space-y-2'>
            <h3 className='text-muted-foreground text-sm font-medium'>
              {t('availableProviders')}
            </h3>
            <EnrichmentProviderCatalog
              connections={connections}
              onChange={reload}
            />
          </div>
        </>
      )}
    </div>
  );
}
