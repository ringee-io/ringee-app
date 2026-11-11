'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, RotateCw, SearchX } from 'lucide-react';
import { useAnalytics } from '@ringee/frontend-shared/hooks/use.analytics';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import type { AvailableNumber } from './tables/buy.number.columns';

/** `GET /telephony/numbers/lookup/:country`, as the page reads it. */
export interface NumberInventoryLookup {
  status: 'results' | 'empty' | 'failed';
  numbers: AvailableNumber[];
  errorCode: string | null;
}

const TYPES = ['local', 'mobile', 'toll_free'] as const;

/**
 * What to do when the live search found nothing — kept apart from when it
 * could not search at all. Every action keeps the country, the type and the
 * rest of the page's state in the URL; nothing is bought or reserved here.
 *
 * - Empty: clear the filters, try another number type, or verify a number
 *   the person already has (outbound caller ID only: international calls,
 *   and returned calls reach that phone, not Ringee).
 * - Failed: retry, or verify an own number meanwhile.
 */
export function NumberLookupRecovery({
  status,
  countryCode,
  numberType,
  filtersUsed
}: {
  status: 'empty' | 'failed';
  countryCode: string;
  numberType: string;
  filtersUsed: boolean;
}) {
  const t = useTranslations('settings.numbers.lookup');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { capture } = useAnalytics();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    capture('readiness_blocker_shown', {
      blocker: status === 'failed' ? 'number_lookup_failed' : 'no_inventory',
      surface: 'buy_number'
    });
  }, [capture, status]);

  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    next.delete('page');
    return `${pathname}?${next.toString()}`;
  };
  const clicked = (action: string) =>
    capture('number_search_recovery_clicked', {
      action,
      lookup_status: status
    });

  const country =
    new Intl.DisplayNames(undefined, { type: 'region' }).of(countryCode) ??
    countryCode;

  return (
    <section
      role={status === 'failed' ? 'alert' : 'status'}
      className='rounded-xl border p-5'
    >
      <div className='flex items-start gap-3'>
        {status === 'failed' ? (
          <AlertTriangle
            aria-hidden
            className='mt-0.5 size-5 shrink-0 text-amber-500'
          />
        ) : (
          <SearchX
            aria-hidden
            className='text-muted-foreground mt-0.5 size-5 shrink-0'
          />
        )}
        <div className='min-w-0 flex-1'>
          <p className='font-semibold'>
            {status === 'failed'
              ? t('failedTitle')
              : t('emptyTitle', {
                  type: t(`types.${numberType}` as never),
                  country
                })}
          </p>
          <p className='text-muted-foreground mt-1 text-sm'>
            {status === 'failed' ? t('failedHint') : t('emptyHint')}
          </p>
          <div className='mt-4 flex flex-wrap gap-2'>
            {status === 'failed' ? (
              <Button
                size='sm'
                onClick={() => {
                  clicked('retry');
                  router.refresh();
                }}
              >
                <RotateCw aria-hidden />
                {t('retry')}
              </Button>
            ) : null}
            {status === 'empty' && filtersUsed ? (
              <Button asChild size='sm' variant='outline'>
                <Link
                  href={href({ areaCode: null, features: null })}
                  onClick={() => clicked('clear_filters')}
                >
                  {t('clearFilters')}
                </Link>
              </Button>
            ) : null}
            {status === 'empty'
              ? TYPES.filter((type) => type !== numberType).map((type) => (
                  <Button key={type} asChild size='sm' variant='outline'>
                    <Link
                      href={href({ numberType: type, areaCode: null })}
                      onClick={() => clicked(`try_${type}`)}
                    >
                      {t('tryType', { type: t(`types.${type}`) })}
                    </Link>
                  </Button>
                ))
              : null}
            <Button asChild size='sm' variant='ghost'>
              <Link
                href='/dashboard/buy-number?tab=caller-ids'
                onClick={() => clicked('verify_own_number')}
              >
                {t('verifyOwn')}
              </Link>
            </Button>
          </div>
          <p className='text-muted-foreground mt-3 text-xs'>
            {t('callbackNote')}
          </p>
        </div>
      </div>
    </section>
  );
}
