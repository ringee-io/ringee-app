'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Sparkles,
  Settings2,
  AlertCircle,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useFieldMappings } from '../../hooks/use-crm-connections';
import type { CrmConnectionSummary, CrmFieldMapping } from '../../types/crm';
import { PROVIDER_META } from '../../types/crm';

const DIRECTION_ICON: Record<string, React.ReactNode> = {
  bidirectional: <ArrowLeftRight className="h-3 w-3 text-sky-500" />,
  push: <ArrowRight className="h-3 w-3 text-emerald-500" />,
  pull: <ArrowLeft className="h-3 w-3 text-violet-500" />,
};

const DIRECTION_LABEL: Record<string, string> = {
  bidirectional: 'Bidirectional',
  push: 'Push (Ringee → CRM)',
  pull: 'Pull (CRM → Ringee)',
};

export function FieldMappingsTab({ connection }: { connection: CrmConnectionSummary }) {
  const api = useApi();
  const { mappings, loading, reload } = useFieldMappings(connection.id);
  const [seeding, setSeeding] = useState(false);
  const meta = PROVIDER_META[connection.provider];
  const isActive = connection.status === 'active';

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      await api.post(`/crm/connections/${connection.id}/field-mappings/seed`);
      toast.success('Default field mappings created');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to seed mappings');
    } finally {
      setSeeding(false);
    }
  };

  const groupedByEntity = mappings.reduce<Record<string, CrmFieldMapping[]>>((acc, m) => {
    const key = `${m.ringeeEntity} → ${m.externalEntity}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Field Mappings</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Control how Ringee fields map to {meta.name} fields when syncing contacts and companies.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => reload()}
            disabled={loading}
            className="h-7"
          >
            <RefreshCw className={`mr-1.5 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {!isActive && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <p>Reconnect to manage field mappings.</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : mappings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">No field mappings configured</h4>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Seed the default mappings for {meta.name} to get started. You can customize them later.
            </p>
          </div>
          <Button
            onClick={handleSeedDefaults}
            disabled={seeding || !isActive}
            size="sm"
          >
            {seeding ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Seed Default Mappings
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByEntity).map(([entityKey, fields]) => (
            <div key={entityKey} className="rounded-lg border">
              <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {entityKey}
                </span>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {fields.length} field{fields.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <div className="divide-y">
                {fields.map((m) => (
                  <MappingRow key={m.id} mapping={m} />
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSeedDefaults}
              disabled={seeding || !isActive}
            >
              {seeding ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Re-seed Defaults
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MappingRow({ mapping }: { mapping: CrmFieldMapping }) {
  const transformType = mapping.transform
    ? (mapping.transform as Record<string, unknown>).type as string || 'custom'
    : 'direct';

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <div className="flex-1 min-w-0">
        <span className="font-mono text-xs">{mapping.ringeeField}</span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {DIRECTION_ICON[mapping.direction]}
        <span className="text-[10px] text-muted-foreground hidden sm:inline">
          {DIRECTION_LABEL[mapping.direction]}
        </span>
      </div>

      <div className="flex-1 min-w-0 text-right">
        <span className="font-mono text-xs">{mapping.externalField}</span>
      </div>

      <Badge variant="outline" className="shrink-0 text-[10px] font-normal ml-2">
        {transformType}
      </Badge>
    </div>
  );
}
