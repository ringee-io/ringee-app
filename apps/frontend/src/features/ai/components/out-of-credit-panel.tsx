'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconCoins, IconBolt } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface Props {
  /** Compact bar variant — replaces the chat input. Otherwise a full card. */
  compact?: boolean;
}

/**
 * Shown when the user's credit balance hits zero. The AI Assistant is billed
 * per token, so the run is blocked until the balance is topped up.
 */
export function OutOfCreditPanel({ compact = false }: Props) {
  const t = useTranslations('ai.outOfCredit');
  const router = useRouter();
  const goToBilling = () => router.push('/dashboard/rate');

  if (compact) {
    return (
      <div className='border-t border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent px-4 py-3'>
        <div className='mx-auto flex max-w-3xl items-center justify-between gap-3'>
          <div className='flex items-center gap-2.5'>
            <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/25 text-amber-600 dark:text-amber-300'>
              <IconCoins size={16} />
            </span>
            <div className='flex flex-col'>
              <span className='text-foreground text-sm font-semibold'>
                {t('compactTitle')}
              </span>
              <span className='text-muted-foreground text-xs'>
                {t('compactDescription')}
              </span>
            </div>
          </div>
          <Button
            size='sm'
            onClick={goToBilling}
            className='h-8 shrink-0 gap-1.5 bg-amber-500 text-amber-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300'
          >
            <IconCoins size={15} />
            {t('addCredit')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center justify-center px-6 py-10 text-center'
      )}
    >
      <div className='relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300'>
        <IconCoins size={30} />
        <span className='absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-amber-950'>
          <IconBolt size={13} fill='currentColor' />
        </span>
      </div>
      <h2 className='text-foreground text-lg font-semibold'>{t('title')}</h2>
      <p className='text-muted-foreground mt-1.5 max-w-sm text-sm'>
        {t('description')}
      </p>
      <Button
        onClick={goToBilling}
        className='mt-5 gap-1.5 bg-amber-500 text-amber-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300'
      >
        <IconCoins size={16} />
        {t('addCredit')}
      </Button>
    </div>
  );
}
