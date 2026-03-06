'use client';

import 'react-phone-number-input/style.css';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Circle, Phone, Delete, ShoppingCart, UserPlus2 } from 'lucide-react';
import PhoneInput from 'react-phone-number-input';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from '@ringee/frontend-shared/components/ui/tooltip';

/**
 * MockDialer - Identical to Dialer but uses mock data and redirects to sign-up on actions.
 * Used for unauthenticated users on the landing page.
 */
export function MockDialer({ full }: { full?: boolean }) {
  const router = useRouter();
  const [number, setNumber] = useState('');
  const audioCtxRef = useRef<AudioContext | null>(null);

  const handleAction = () => {
    router.push('/sign-up');
  };

  // DTMF tones - same as real dialer
  const dtmfFrequencies: Record<string, [number, number]> = {
    '1': [697, 1209],
    '2': [697, 1336],
    '3': [697, 1477],
    '4': [770, 1209],
    '5': [770, 1336],
    '6': [770, 1477],
    '7': [852, 1209],
    '8': [852, 1336],
    '9': [852, 1477],
    '*': [941, 1209],
    '0': [941, 1336],
    '#': [941, 1477]
  };

  const playTone = (key: string) => {
    if (!dtmfFrequencies[key]) return;

    const ctx = audioCtxRef.current || new AudioContext();
    audioCtxRef.current = ctx;

    const [lowFreq, highFreq] = dtmfFrequencies[key];

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.frequency.value = lowFreq;
    osc2.frequency.value = highFreq;
    gain.gain.value = 0.1;

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();

    setTimeout(() => {
      osc1.stop();
      osc2.stop();
      osc1.disconnect();
      osc2.disconnect();
    }, 150);
  };

  const handlePress = (k: string) => {
    playTone(k);
    if (number?.includes('+')) {
      setNumber(number + k);
    } else {
      setNumber(`+${number}${k}`);
    }
  };

  const handleDelete = () => {
    setNumber(number.slice(0, -1));
  };

  const keys = [
    { n: '1' },
    { n: '2', s: 'ABC' },
    { n: '3', s: 'DEF' },
    { n: '4', s: 'GHI' },
    { n: '5', s: 'JKL' },
    { n: '6', s: 'MNO' },
    { n: '7', s: 'PQRS' },
    { n: '8', s: 'TUV' },
    { n: '9', s: 'WXYZ' },
    { n: '*', s: '' },
    { n: '0', s: '+' },
    { n: '#', s: '' }
  ];

  return (
    <div
      className={cn('', {
        'grid grid-cols-1 md:grid-cols-3': !full,
        'w-full': full
      })}
    >
      <Card className='@container/card'>
        <CardHeader className='flex items-center justify-between pb-3'>
          <div className='flex items-center gap-2'>
            <p className='text-muted-foreground text-sm font-semibold'>
              A free call trial is available!
            </p>
          </div>
          <Circle className='h-3 w-3' />
        </CardHeader>

        <CardContent className='space-y-3'>
          {/* NumberSelector Mock - identical layout */}
          <div className='mb-4'>
            <div className='mb-1 flex items-center justify-between'>
              <p className='text-muted-foreground text-xs font-medium'>
                Call from: <b>Public Number</b>
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    title='Why buy a number?'
                    onClick={handleAction}
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
            </div>
            <div className='border-border/40 bg-muted/20 flex flex-col items-center justify-center rounded-md border py-4'>
              <p className='text-muted-foreground mb-2 text-sm'>
                You don't need a number to call
              </p>
              <Button
                variant='outline'
                size='sm'
                className='flex items-center gap-2'
                onClick={handleAction}
              >
                <ShoppingCart className='h-4 w-4' />
                Buy number
              </Button>
            </div>
          </div>

          <Separator className='opacity-10' />

          {/* ContactSelector Mock - identical layout */}
          <div className='mb-4 min-h-[70px] w-full space-y-2 text-center'>
            <div className='flex flex-col items-center py-2'>
              <p className='text-muted-foreground mb-2 text-sm'>
                No contacts found
              </p>
              <Button
                variant='outline'
                size='sm'
                className='flex items-center gap-2'
                onClick={handleAction}
              >
                <UserPlus2 className='h-4 w-4' />
                Add contact
              </Button>
            </div>
          </div>

          <Separator className='opacity-10' />

          {/* PhoneInput - identical */}
          <PhoneInput
            international
            defaultCountry='US'
            placeholder='Enter number'
            // @ts-ignore
            value={number}
            onChange={(v) => setNumber(v || '')}
            className='bg-background w-full rounded-md border-none text-center text-lg tracking-widest focus:outline-none'
          />

          {/* DialPad - identical layout */}
          <div className='flex flex-col items-center gap-3'>
            <div className='grid grid-cols-3 gap-3'>
              {keys.map((k) => (
                <button
                  key={k.n}
                  onClick={() => handlePress(k.n)}
                  className='bg-muted/60 hover:bg-accent text-foreground flex h-20 w-32 flex-col items-center justify-center rounded-xl text-xl font-semibold transition-all active:scale-95'
                >
                  {k.n}
                  {k.s && (
                    <span className='text-muted-foreground mt-0.5 text-[10px] font-normal'>
                      {k.s}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className='mt-2 flex gap-8'>
              <button
                onClick={handleAction}
                className='flex h-20 w-20 items-center justify-center rounded-xl bg-green-600 hover:bg-green-700 transition-all active:scale-95'
              >
                <Phone className='h-6 w-6 text-white' />
              </button>

              <button
                onClick={handleDelete}
                className='bg-muted hover:bg-accent flex h-20 w-20 items-center justify-center rounded-xl transition-all active:scale-95'
              >
                <Delete className='text-foreground h-5 w-5' />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
