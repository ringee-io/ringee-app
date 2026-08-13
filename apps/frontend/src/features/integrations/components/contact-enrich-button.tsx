'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useEnrichmentMutations } from '../hooks/use-enrichment-connections';
import type { EnrichmentJobRow } from '../types/enrichment';

interface Props {
  contactId: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
  onEnriched?: (job: EnrichmentJobRow) => void;
  waterfall?: boolean;
}

export function ContactEnrichButton({
  contactId,
  variant = 'default',
  size = 'sm',
  onEnriched,
  waterfall = true
}: Props) {
  const { enrichContact } = useEnrichmentMutations();
  const t = useTranslations('integrations.enrichment.button');
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      const job = await enrichContact(contactId, { waterfall });
      switch (job.status) {
        case 'done':
          toast.success(t('toasts.enriched'));
          break;
        case 'not_found':
          toast.message(t('toasts.notFound'), {
            description: t('toasts.notFoundDescription')
          });
          break;
        case 'skipped':
          toast.message(t('toasts.skipped'), {
            description: t('toasts.skippedDescription')
          });
          break;
        case 'failed': {
          const err = job.lastError ?? t('toasts.failed');
          if (/^VALIDATION/i.test(err)) {
            toast.error(t('toasts.rejected'), {
              description: t('toasts.rejectedDescription')
            });
          } else {
            toast.error(err);
          }
          break;
        }
        default:
          toast.message(t('toasts.otherStatus', { status: job.status }));
      }
      onEnriched?.(job);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button onClick={handleClick} disabled={busy} variant={variant} size={size}>
      {busy ? (
        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
      ) : (
        <Sparkles className='mr-2 h-4 w-4' />
      )}
      {t('enrich')}
    </Button>
  );
}
