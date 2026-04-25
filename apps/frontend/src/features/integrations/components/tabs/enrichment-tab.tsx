'use client';

import { Alert, AlertDescription, AlertTitle } from '@ringee/frontend-shared/components/ui/alert';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Sparkles } from 'lucide-react';
import { useEnrichmentConnections } from '../../hooks/use-enrichment-connections';
import { EnrichmentConnectionCard } from '../enrichment-connection-card';
import { EnrichmentProviderCatalog } from '../enrichment-provider-catalog';

export function EnrichmentTab() {
  const { connections, loading, reload } = useEnrichmentConnections();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Data Enrichment
        </h2>
        <p className="text-sm text-muted-foreground">
          Connect a provider to enrich your contacts with phone, email, LinkedIn, company size, tech
          stack and more — and to find new leads.
        </p>
      </div>

      <Alert>
        <AlertTitle>How billing works</AlertTitle>
        <AlertDescription>
          We only debit credits when an enrichment returns results. Lead search and lead import
          credits are configured in your workspace settings.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          {connections.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Your connections</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {connections.map((c) => (
                  <EnrichmentConnectionCard key={c.id} connection={c} onChange={reload} />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Available providers</h3>
            <EnrichmentProviderCatalog connections={connections} onChange={reload} />
          </div>
        </>
      )}
    </div>
  );
}
