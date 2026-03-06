'use client';

import { useEffect } from 'react';
import { useNumbersStore } from '../store/number.selector.store';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from '@ringee/frontend-shared/components/ui/tooltip';
import { Phone, ShoppingCart } from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useRouter } from 'next/navigation';

export function NumberSelector({ useMock }: { useMock?: boolean }) {
  const api = useApi();
  const router = useRouter();

  const { numbers: rawNumbers, selectedNumber, fetchNumbers, selectNumber, status } =
    useNumbersStore();

  useEffect(() => {
    if (!useMock) {
      fetchNumbers(api);
    }
  }, [useMock]);

  const isLoading = status === 'loading';
  const numbers = rawNumbers.filter(item => !(['pending', 'inactive'].includes(item.status ?? '')))
  const hasNumbers = numbers.length > 0;

  return (
    <div className='mb-4'>
      <div className='mb-1 flex items-center justify-between'>
        <p className='text-muted-foreground text-xs font-medium'>
          Call from: <b>{!hasNumbers ? 'Public Number' : ''}</b>
        </p>
        {/* {!hasNumbers && ( */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              title='Why buy a number?'
              onClick={() => router.push('/dashboard/buy-number')}
              className='text-muted-foreground cursor-pointer text-xs underline'
            >
              Why buy a number?
            </span>
          </TooltipTrigger>
          <TooltipContent side='top' className='max-w-[240px] text-sm'>
            Buying a number allows you to make and receive real calls. Number
            prices start at <strong>$1.00 USD</strong> monthly according to the
            country and number type.
          </TooltipContent>
        </Tooltip>
        {/* )} */}
      </div>

      {/* Select de números */}
      {isLoading && <Skeleton className='h-9 w-full rounded-md' />}

      {!isLoading && hasNumbers && (
        <Select
          value={selectedNumber?.id || ''}
          onValueChange={(id) => {
            const num = numbers.find((n) => n.id === id);
            selectNumber(num || null);
          }}
        >
          <SelectTrigger
            className={cn(
              'bg-muted/40 border-border/50 w-full text-sm font-medium'
            )}
          >
            <SelectValue
              placeholder='Select a number'
              className='text-foreground'
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='public' key='public'>
              <Phone className='text-muted-foreground h-3.5 w-3.5' />
              <span>Public number</span>
            </SelectItem>

            {numbers.map((n) => (
              <SelectItem key={n.id} value={n.id}>
                <div className='flex items-center gap-2'>
                  <Phone className='text-muted-foreground h-3.5 w-3.5' />
                  <span>{n.phoneNumber}</span>
                  <span className='text-muted-foreground ml-auto text-xs'>
                    {n.isoCountry}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Sin números comprados */}
      {!isLoading && !hasNumbers && (
        <div className='border-border/40 bg-muted/20 flex flex-col items-center justify-center rounded-md border py-4'>
          <p className='text-muted-foreground mb-2 text-sm'>
            You don't need a number to call
          </p>
          <Button
            variant='outline'
            size='sm'
            className='flex items-center gap-2'
            onClick={() => router.push('/dashboard/buy-number')}
          >
            <ShoppingCart className='h-4 w-4' />
            Buy number
          </Button>
        </div>
      )}
    </div>
  );
}
