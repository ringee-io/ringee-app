'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { IconShoppingCart } from '@tabler/icons-react';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AvailableNumber } from './buy.number.columns';

export const CellActionBuy = ({ data }: { data: AvailableNumber }) => {
  const [loading, setLoading] = useState(false);
  const api = useApi();
  const router = useRouter();

  const handlePurchase = async () => {
    try {
      setLoading(true);

      const { url } = await api.post<{ url: string }>(
        '/stripe/checkout/phone',
        {
          numberId: data.phoneNumber,
          costInformation: {
            monthlyCost: Number(data.costInformation.monthlyCost),
            upfrontCost: Number(data.costInformation.upfrontCost),
            currency: data.costInformation.currency
          }
        }
      );

      router.push(url);
    } catch (err) {
      toast.error('Failed to purchase number');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size='sm'
      onClick={handlePurchase}
      disabled={loading}
      variant='default'
      className='cursor-pointer'
    >
      <IconShoppingCart className='mr-2 h-4 w-4' />
      Buy
    </Button>
  );
};
