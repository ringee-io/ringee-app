import FormCardSkeleton from '@ringee/frontend-shared/components/form-card-skeleton';
import { RateClient } from '@/features/rate/components/rate';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { Suspense } from 'react';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('calls.rates');
  return {
    title: t('metaTitle'),
    description: t('metaDescription')
  };
}

export default async function RateLayout() {
  const rates = await apiServer.get('/telephony/rates');

  return (
    <Suspense fallback={<FormCardSkeleton />}>
      <RateClient initialRates={rates} />
    </Suspense>
  );
}
