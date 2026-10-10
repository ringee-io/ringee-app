'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';

/** Shown in place of a list that failed to load, with a way to retry. */
export function ListsLoadError() {
  const t = useTranslations('lists.loadError');
  const router = useRouter();

  return (
    <div
      role='alert'
      className='flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center'
    >
      <IconAlertTriangle className='text-muted-foreground mb-4 size-10' />
      <h3 className='text-lg font-semibold'>{t('title')}</h3>
      <p className='text-muted-foreground mt-1 text-sm'>{t('description')}</p>
      <Button
        variant='outline'
        size='sm'
        className='mt-5'
        onClick={() => router.refresh()}
      >
        {t('retry')}
      </Button>
    </div>
  );
}
