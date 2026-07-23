'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';

const FALLBACK = {
  eyebrow: 'Secure billing powered by Stripe',
  title: 'Opening your billing portal',
  description:
    'Manage subscriptions, payment methods, invoices and billing information securely in Stripe.',
  redirecting: 'Redirecting to Stripe…',
  retry: 'Open Stripe billing portal',
  error: 'We could not open the billing portal. Please try again in a moment.'
};

export function BillingPortalLauncher() {
  const api = useApi();
  const t = useTranslations('billing');
  const copy = t.has('portal')
    ? ({ ...FALLBACK, ...(t.raw('portal') as object) } as typeof FALLBACK)
    : FALLBACK;
  const started = useRef(false);
  const [opening, setOpening] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const openPortal = useCallback(async () => {
    setOpening(true);
    setError(null);
    try {
      const { url } = await api.post<{ url: string }>('/stripe/billing/portal');
      window.location.assign(url);
    } catch {
      setOpening(false);
      setError(copy.error);
    }
  }, [api, copy.error]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void openPortal();
  }, [openPortal]);

  return (
    <div className='flex min-h-[420px] items-center justify-center py-8'>
      <Card className='w-full max-w-xl overflow-hidden shadow-sm'>
        <div className='h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500' />
        <CardHeader className='items-center px-6 pt-10 text-center sm:px-10'>
          <div className='mb-3 flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300'>
            {opening ? (
              <Loader2 className='size-6 animate-spin' />
            ) : (
              <ExternalLink className='size-6' />
            )}
          </div>
          <div className='flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400'>
            <ShieldCheck className='size-4' />
            {copy.eyebrow}
          </div>
          <CardTitle className='pt-2 text-2xl'>{copy.title}</CardTitle>
          <CardDescription className='max-w-md text-sm leading-6'>
            {copy.description}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col items-center px-6 pb-10 sm:px-10'>
          {error ? (
            <>
              <p
                role='alert'
                className='mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
              >
                {error}
              </p>
              <Button onClick={() => void openPortal()}>
                <ExternalLink className='mr-2 size-4' />
                {copy.retry}
              </Button>
            </>
          ) : (
            <div className='text-muted-foreground flex items-center gap-2 text-sm'>
              <Loader2 className='size-4 animate-spin' />
              {copy.redirecting}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
