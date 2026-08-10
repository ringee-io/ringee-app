'use client';

import { useEffect, useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { PhoneOff, Sparkles, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useConcurrentCallStore } from '../store/concurrent-call.store';

/**
 * Shown when the backend refuses a dial because the user is already on a call
 * somewhere else (409 `CONCURRENT_CALL`).
 *
 * A toast was not enough here: the refusal is a product rule, not a glitch, and
 * the honest answer to "I need two calls at once" is a second seat. So the
 * alert explains the rule and — for a solo account — offers the Organization
 * plan, where every teammate calls from their own account in parallel.
 *
 * Mounted once in the dashboard shell; raised from anywhere with
 * `notifyConcurrentCall()`.
 */
export function ConcurrentCallDialog() {
  const t = useTranslations('calls.concurrentCall');
  const tUpgrade = useTranslations('organizations.upgrade');
  const api = useApi();
  const { organization, isLoaded: isOrgLoaded } = useOrganization();

  const open = useConcurrentCallStore((s) => s.open);
  const message = useConcurrentCallStore((s) => s.message);
  const dismiss = useConcurrentCallStore((s) => s.dismiss);

  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>(
    'month'
  );
  const [redirecting, setRedirecting] = useState(false);
  // `null` = not asked yet. Only relevant without an active org, so the request
  // is deferred until the alert actually opens for a solo account.
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);

  // The browser extension can't run Stripe checkout, so its "Upgrade" button
  // hands off to the dashboard with this flag and the alert continues here.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgrade') !== 'organization') return;
    useConcurrentCallStore.getState().show(t('handoffMessage'));
    params.delete('upgrade');
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open || !isOrgLoaded || organization || hasSubscription !== null) {
      return;
    }
    let cancelled = false;
    api
      .get<{ hasAvailable: boolean }>('/subscriptions/available')
      .then((res) => {
        if (!cancelled) setHasSubscription(!!res?.hasAvailable);
      })
      .catch(() => {
        // Treat an unknown subscription state as "no plan": showing the upsell
        // is recoverable, hiding the only way forward is not.
        if (!cancelled) setHasSubscription(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, open, isOrgLoaded, organization, hasSubscription]);

  const handleUpgrade = async () => {
    setRedirecting(true);
    try {
      // Same checkout the sidebar and the org switcher use — the cadence has to
      // be sent or the annual choice is still billed monthly.
      const res = await api.post<{ url: string }>(
        '/stripe/checkout/organization',
        { billingInterval }
      );
      if (res?.url) {
        window.location.href = res.url;
        return;
      }
    } catch {
      // Leave the alert up; the user can retry or dismiss it.
    }
    setRedirecting(false);
  };

  // Someone already paying for the plan doesn't need to be sold it again.
  const showUpsell = isOrgLoaded && !organization && hasSubscription === false;

  const teamNote =
    isOrgLoaded && organization
      ? t('orgMemberNote')
      : hasSubscription
        ? t('subscriptionReadyNote')
        : t('teamPitch');

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <div className='flex items-start gap-3'>
            <div className='bg-destructive/10 text-destructive mt-0.5 rounded-full p-2'>
              <PhoneOff className='h-5 w-5' />
            </div>
            <div className='space-y-1 text-left'>
              <DialogTitle>{t('title')}</DialogTitle>
              <DialogDescription>
                {message ?? t('fallbackMessage')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <p className='text-muted-foreground text-sm'>{t('explanation')}</p>

        <div className='rounded-lg border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-teal-400/5 to-cyan-400/5 p-4'>
          <div className='flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300'>
            <Users className='h-4 w-4' />
            {tUpgrade('title')}
          </div>
          <p className='text-muted-foreground mt-1.5 text-sm'>{teamNote}</p>

          {showUpsell ? (
            <div className='mt-4 space-y-3'>
              <div className='border-border/50 bg-muted/50 inline-flex w-full rounded-lg border p-1'>
                <button
                  type='button'
                  onClick={() => setBillingInterval('month')}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    billingInterval === 'month'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tUpgrade('billingMonthly')}
                </button>
                <button
                  type='button'
                  onClick={() => setBillingInterval('year')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    billingInterval === 'year'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tUpgrade('billingAnnual')}
                  <span className='rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'>
                    {tUpgrade('annualSavings')}
                  </span>
                </button>
              </div>

              <div className='flex items-baseline gap-1'>
                <span className='text-foreground text-2xl font-bold'>
                  {billingInterval === 'year' ? '$200' : '$20'}
                </span>
                <span className='text-muted-foreground text-xs'>
                  {billingInterval === 'year'
                    ? tUpgrade('perYear')
                    : tUpgrade('perMonth')}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
          <Button variant='outline' onClick={dismiss}>
            {t('dismiss')}
          </Button>
          {showUpsell ? (
            <Button
              onClick={handleUpgrade}
              disabled={redirecting}
              className='bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 font-semibold text-white'
            >
              <Sparkles className='h-4 w-4' />
              {redirecting ? t('redirecting') : t('upgrade')}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
