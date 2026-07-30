'use client';

import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Sparkles } from 'lucide-react';
import { useEnrichmentConnections } from '../../hooks/use-enrichment-connections';
import { EnrichmentConnectionCard } from '../enrichment-connection-card';
import { EnrichmentProviderCatalog } from '../enrichment-provider-catalog';

export function EnrichmentTab() {
  const { connections, loading, reload } = useEnrichmentConnections();

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='flex items-center gap-2 text-lg font-semibold'>
          <Sparkles className='h-5 w-5' />
          Data Enrichment
        </h2>
        <p className='text-muted-foreground text-sm'>
          Connect a provider to enrich your contacts with phone, email,
          LinkedIn, company size, tech stack and more — and to find new leads.
        </p>
      </div>

      <Alert>
        <AlertTitle>How billing works</AlertTitle>
        <AlertDescription>
          Ringee never debits your calling credits for enrichment, lead search,
          import, or reveal. Search and reveal may use credits from your
          connected Apollo or Prospeo account.
        </AlertDescription>
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
                Your connections
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
              Available providers
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
