import FormCardSkeleton from '@ringee/frontend-shared/components/form-card-skeleton';
import { RateClient } from '@/features/rate/components/rate';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { Suspense } from 'react';

export const metadata = {
  title: 'Call Rates — View and Compare Costs | Ringee',
  description:
    'Access up-to-date calling rates in your Ringee dashboard. Compare prices across 180+ countries and keep track of your communication costs in real time.'
};

export default async function RateLayout() {
  const rates = await apiServer.get('/telephony/rates');

  return (
    <Suspense fallback={<FormCardSkeleton />}>
      <RateClient initialRates={rates} />
    </Suspense>
  );
}
