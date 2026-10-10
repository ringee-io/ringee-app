'use client';

import { CreditPopover } from '@/features/credit/components/credit.popover';
import { Phone, Delete, Loader2 } from 'lucide-react';
import { useRef } from 'react';
import {
  countryCallingCode,
  DEFAULT_REGION,
  type CountryCode
} from '@ringee/dialer-core/phone';
import { useTranslations } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';

export function DialPad({
  number,
  setNumber,
  onDelete,
  onCall,
  isCalling,
  callingDisabled = false,
  disabledReason,
  showCreditPopover = false,
  country = DEFAULT_REGION,
  compact = false
}: {
  number: string;
  setNumber: (v: string) => void;
  onDelete: () => void;
  onCall: () => Promise<void>;
  /** A dial is starting: the button spins and takes no second press. */
  isCalling: boolean;
  callingDisabled?: boolean;
  /** Why calling is unavailable right now (e.g. already on a call). */
  disabledReason?: string;
  showCreditPopover?: boolean;
  /** Currently selected dialing country — seeds the calling code for taps. */
  country?: CountryCode;
  /** Smaller keys, for a keypad that opens over the page. */
  compact?: boolean;
}) {
  const t = useTranslations('calls.dialer');
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

  const audioCtxRef = useRef<AudioContext | null>(null);

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
    gain.gain.value = 0.1; // volumen suave

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();

    // detener tono después de 150ms (realista)
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
      // First tap of a fresh number: seed the selected country's calling
      // code so tapping local-style digits (e.g. a 9-digit Spanish number)
      // dials the right country instead of an invalid "+<local digits>".
      setNumber(`+${countryCallingCode(country)}${number}${k}`);
    }
  };

  return (
    <div
      className={cn('flex flex-col items-center', compact ? 'gap-2' : 'gap-3')}
    >
      <div className={cn('grid grid-cols-3', compact ? 'gap-2' : 'gap-3')}>
        {keys.map((k) => (
          <button
            key={k.n}
            type='button'
            onClick={() => handlePress(k.n)}
            className={cn(
              'bg-muted/60 hover:bg-accent text-foreground flex flex-col items-center justify-center rounded-xl font-semibold transition-all active:scale-95',
              compact ? 'h-14 w-[4.75rem] text-lg' : 'h-20 w-32 text-xl'
            )}
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

      <div className={cn('mt-2 flex', compact ? 'gap-6' : 'gap-8')}>
        {showCreditPopover ? (
          <CreditPopover fetch={false}>
            <button
              aria-label={t('call')}
              title={t('call')}
              className={cn(
                'flex items-center justify-center rounded-xl bg-green-600 transition-all hover:bg-green-700 active:scale-95',
                compact ? 'h-14 w-14' : 'h-20 w-20'
              )}
            >
              <Phone className='h-6 w-6 text-white' />
            </button>
          </CreditPopover>
        ) : (
          <button
            onClick={onCall}
            disabled={
              !number || callingDisabled || isCalling || !!disabledReason
            }
            aria-label={isCalling ? t('starting') : t('call')}
            title={
              callingDisabled
                ? t('outboundDisabled')
                : isCalling
                  ? t('starting')
                  : (disabledReason ?? t('call'))
            }
            className={cn(
              'flex items-center justify-center rounded-xl bg-green-600 transition-all hover:bg-green-700 active:scale-95 disabled:cursor-not-allowed',
              compact ? 'h-14 w-14' : 'h-20 w-20',
              (callingDisabled || disabledReason || !number) && 'opacity-50'
            )}
          >
            {isCalling ? (
              <Loader2 className='h-6 w-6 animate-spin text-white' />
            ) : (
              <Phone className='h-6 w-6 text-white' />
            )}
          </button>
        )}

        <button
          onClick={onDelete}
          aria-label={t('deleteDigit')}
          title={t('deleteDigit')}
          className={cn(
            'bg-muted hover:bg-accent flex items-center justify-center rounded-xl transition-all active:scale-95',
            compact ? 'h-14 w-14' : 'h-20 w-20'
          )}
        >
          <Delete className='text-foreground h-5 w-5' />
        </button>
      </div>
    </div>
  );
}
