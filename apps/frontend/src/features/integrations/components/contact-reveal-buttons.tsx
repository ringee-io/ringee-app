'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Loader2, Mail, Phone } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useEnrichmentMutations } from '../hooks/use-enrichment-connections';

type RevealKind = 'email' | 'phone';

interface Props {
  contactId: string;
  hasEmail: boolean;
  hasPhone: boolean;
  provider: string | null;
  onRevealed?: () => void;
}

const PROVIDER_LABEL: Record<string, string> = {
  prospeo: 'Prospeo',
  apollo: 'Apollo'
};

export function ContactRevealButtons({
  contactId,
  hasEmail,
  hasPhone,
  provider,
  onRevealed
}: Props) {
  const { revealContact } = useEnrichmentMutations();
  const [busy, setBusy] = useState<RevealKind | null>(null);

  const run = async (kind: RevealKind) => {
    setBusy(kind);
    try {
      const res = await revealContact(contactId, {
        revealEmail: kind === 'email',
        revealPhone: kind === 'phone'
      });
      const revealed = kind === 'email' ? res.emailRevealed : res.phoneRevealed;
      if (revealed) {
        toast.success(
          kind === 'email' ? 'Email revealed' : 'Phone number revealed'
        );
        onRevealed?.();
      } else {
        toast.message('Provider returned no data for this contact');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reveal failed');
    } finally {
      setBusy(null);
    }
  };

  if (hasEmail && hasPhone) return null;

  const providerName =
    (provider && PROVIDER_LABEL[provider.toLowerCase()]) ||
    (provider ?? 'provider');

  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-xs'>
        Imported from {providerName}. Reveal missing contact info using your{' '}
        {providerName} credits.
      </p>
      <div className='flex flex-wrap gap-2'>
        {!hasEmail && (
          <Button
            size='sm'
            variant='outline'
            disabled={busy !== null}
            onClick={() => run('email')}
          >
            {busy === 'email' ? (
              <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
            ) : (
              <Mail className='mr-1.5 h-3.5 w-3.5' />
            )}
            Reveal email
          </Button>
        )}
        {!hasPhone && (
          <Button
            size='sm'
            disabled={busy !== null}
            onClick={() => run('phone')}
          >
            {busy === 'phone' ? (
              <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
            ) : (
              <Phone className='mr-1.5 h-3.5 w-3.5' />
            )}
            Reveal phone
          </Button>
        )}
      </div>
    </div>
  );
}
