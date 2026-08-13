'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Loader2, Mail, Phone } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('integrations.enrichment.reveal');
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
          kind === 'email'
            ? t('toasts.emailRevealed')
            : t('toasts.phoneRevealed')
        );
        onRevealed?.();
      } else {
        toast.message(t('toasts.noData'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.failed'));
    } finally {
      setBusy(null);
    }
  };

  if (hasEmail && hasPhone) return null;

  const providerName =
    (provider && PROVIDER_LABEL[provider.toLowerCase()]) ||
    (provider ?? t('genericProvider'));

  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-xs'>
        {t('importedFrom', { provider: providerName })}
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
            {t('revealEmail')}
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
            {t('revealPhone')}
          </Button>
        )}
      </div>
    </div>
  );
}
