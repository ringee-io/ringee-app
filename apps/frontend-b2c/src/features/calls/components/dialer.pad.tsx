'use client';

import { CreditPopover } from '@/features/credit/components/credit.popover';
import { Phone, Delete } from 'lucide-react';
import { useRef } from 'react';

export function DialPad({
  number,
  setNumber,
  onDelete,
  onCall,
  isCalling,
  showCreditPopover = false
}: {
  number: string;
  setNumber: (v: string) => void;
  onDelete: () => void;
  onCall: () => Promise<void>;
  isCalling: boolean;
  showCreditPopover?: boolean;
}) {
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
      setNumber(`+${number}${k}`);
    }
  };

  return (
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
        {showCreditPopover ? (
          <CreditPopover fetch={false}>
            <button
              className={`flex h-20 w-20 items-center justify-center rounded-xl transition-all active:scale-95 ${
                isCalling
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <Phone className='h-6 w-6 text-white' />
            </button>
          </CreditPopover>
        ) : (
          <button
            onClick={onCall}
            disabled={!number}
            className={`flex h-20 w-20 items-center justify-center rounded-xl transition-all active:scale-95 ${
              isCalling
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            <Phone className='h-6 w-6 text-white' />
          </button>
        )}

        <button
          onClick={onDelete}
          className='bg-muted hover:bg-accent flex h-20 w-20 items-center justify-center rounded-xl transition-all active:scale-95'
        >
          <Delete className='text-foreground h-5 w-5' />
        </button>
      </div>
    </div>
  );
}
