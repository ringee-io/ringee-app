'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      const job = await enrichContact(contactId, { waterfall });
      switch (job.status) {
        case 'done':
          toast.success('Contact enriched');
          break;
        case 'not_found':
          toast.message('No match found for this contact', {
            description:
              'Provider had no data — try adding more info to the contact.'
          });
          break;
        case 'skipped':
          toast.message('Recently enriched (cached)', {
            description: 'Used cached result from last 30 days.'
          });
          break;
        case 'failed': {
          const err = job.lastError ?? 'Enrichment failed';
          if (/^VALIDATION/i.test(err)) {
            toast.error('Provider rejected this lookup', {
              description:
                'The contact may lack enough info (name, email, LinkedIn) for the provider to match. Try editing the contact and adding more data.'
            });
          } else {
            toast.error(err);
          }
          break;
        }
        default:
          toast.message(`Enrichment ${job.status}`);
      }
      onEnriched?.(job);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enrichment failed');
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
      Enrich
    </Button>
  );
}
