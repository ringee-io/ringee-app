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
  AlertCircle
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useFieldMappings } from '../../hooks/use-crm-connections';
import type { CrmConnectionSummary, CrmFieldMapping } from '../../types/crm';
import { PROVIDER_META } from '../../types/crm';

const DIRECTION_ICON: Record<string, React.ReactNode> = {
  bidirectional: <ArrowLeftRight className='h-3 w-3 text-sky-500' />,
  push: <ArrowRight className='h-3 w-3 text-emerald-500' />,
  pull: <ArrowLeft className='h-3 w-3 text-violet-500' />
};

export function FieldMappingsTab({
  connection
}: {
  connection: CrmConnectionSummary;
}) {
  const api = useApi();
  const t = useTranslations('integrations.crm.fieldMappings');
  const { mappings, loading, reload } = useFieldMappings(connection.id);
  const [seeding, setSeeding] = useState(false);
  const meta = PROVIDER_META[connection.provider];
  const isActive = connection.status === 'active';

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      await api.post(`/crm/connections/${connection.id}/field-mappings/seed`);
      toast.success(t('toasts.seeded'));
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.seedError'));
    } finally {
      setSeeding(false);
    }
  };

  const groupedByEntity = mappings.reduce<Record<string, CrmFieldMapping[]>>(
    (acc, m) => {
      const key = `${m.ringeeEntity} → ${m.externalEntity}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(m);
      return acc;
    },
    {}
  );

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h3 className='text-sm font-semibold'>{t('title')}</h3>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t('description', { provider: meta.name })}
          </p>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => reload()}
            disabled={loading}
            className='h-7'
          >
            <RefreshCw
              className={`mr-1.5 h-3 w-3 ${loading ? 'animate-spin' : ''}`}
            />
            {t('refresh')}
          </Button>
        </div>
      </div>

      {!isActive && (
        <div className='flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs'>
          <AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500' />
          <p>{t('reconnectHint')}</p>
        </div>
      )}

      {loading ? (
        <div className='space-y-2'>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className='h-16 w-full' />
          ))}
        </div>
      ) : mappings.length === 0 ? (
        <div className='bg-muted/20 flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center'>
          <div className='bg-muted flex h-12 w-12 items-center justify-center rounded-full'>
            <Settings2 className='text-muted-foreground h-5 w-5' />
          </div>
          <div>
            <h4 className='text-sm font-semibold'>{t('empty.title')}</h4>
            <p className='text-muted-foreground mt-1 max-w-sm text-xs'>
              {t('empty.description', { provider: meta.name })}
            </p>
          </div>
          <Button
            onClick={handleSeedDefaults}
            disabled={seeding || !isActive}
            size='sm'
          >
            {seeding ? (
              <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
            ) : (
              <Sparkles className='mr-1.5 h-3.5 w-3.5' />
            )}
            {t('seedDefaults')}
          </Button>
        </div>
      ) : (
        <div className='space-y-4'>
          {Object.entries(groupedByEntity).map(([entityKey, fields]) => (
            <div key={entityKey} className='rounded-lg border'>
              <div className='bg-muted/30 flex items-center gap-2 border-b px-4 py-2.5'>
                <Settings2 className='text-muted-foreground h-3.5 w-3.5' />
                <span className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
                  {entityKey}
                </span>
                <Badge variant='outline' className='ml-auto text-[10px]'>
                  {t('fieldCount', { count: fields.length })}
                </Badge>
              </div>
              <div className='divide-y'>
                {fields.map((m) => (
                  <MappingRow key={m.id} mapping={m} />
                ))}
              </div>
            </div>
          ))}

          <div className='flex justify-end'>
            <Button
              variant='outline'
              size='sm'
              onClick={handleSeedDefaults}
              disabled={seeding || !isActive}
            >
              {seeding ? (
                <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
              ) : (
                <Sparkles className='mr-1.5 h-3.5 w-3.5' />
              )}
              {t('reseedDefaults')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MappingRow({ mapping }: { mapping: CrmFieldMapping }) {
  const t = useTranslations('integrations.crm.fieldMappings');
  const transformType = mapping.transform
    ? ((mapping.transform as Record<string, unknown>).type as string) ||
      'custom'
    : 'direct';

  return (
    <div className='flex items-center gap-3 px-4 py-2.5 text-sm'>
      <div className='min-w-0 flex-1'>
        <span className='font-mono text-xs'>{mapping.ringeeField}</span>
      </div>

      <div className='flex shrink-0 items-center gap-1.5'>
        {DIRECTION_ICON[mapping.direction]}
        <span className='text-muted-foreground hidden text-[10px] sm:inline'>
          {t.has(`direction.${mapping.direction}`)
            ? t(`direction.${mapping.direction}`)
            : mapping.direction}
        </span>
      </div>

      <div className='min-w-0 flex-1 text-right'>
        <span className='font-mono text-xs'>{mapping.externalField}</span>
      </div>

      <Badge
        variant='outline'
        className='ml-2 shrink-0 text-[10px] font-normal'
      >
        {transformType}
      </Badge>
    </div>
  );
}
