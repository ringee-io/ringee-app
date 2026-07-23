'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { NumberPurchased } from './my.number.columns';

export function VerifyNumberCell({ data }: { data: NumberPurchased }) {
  const t = useTranslations('settings.numbers.verify');

  const status = (data.status || '').toLowerCase();
  const actionable = ['pending', 'rejected', 'expired'].includes(status);

  if (!actionable) {
    return null;
  }

  const needsFix = status === 'rejected' || status === 'expired';

  return (
    <Button
      asChild
      size='sm'
      variant='default'
      className={
        needsFix
          ? 'cursor-pointer bg-red-500 hover:bg-red-600'
          : 'cursor-pointer bg-orange-500 hover:bg-orange-600'
      }
    >
      <Link href={`/dashboard/buy-number/${data.id}/verification`}>
        {needsFix ? t('ctaFix') : t('cta')}
      </Link>
    </Button>
  );
}
