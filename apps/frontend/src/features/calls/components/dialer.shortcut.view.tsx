'use client';

import { useEffect } from 'react';
import { useDialerStore } from '../store/dialer.store';
import { Dialer } from './dialer';

export function DialerShortcutView({
  defaultOpen,
  useMock
}: {
  defaultOpen?: boolean;
  useMock?: boolean;
}) {
  const { quickDial, quickDialState, setQuickDial } = useDialerStore();

  useEffect(() => {
    if (defaultOpen) {
      setQuickDial(true);
    }
  }, [defaultOpen]);

  if (quickDialState === 'idle' && defaultOpen) {
    return (
      <div className='mt-4 hidden pr-4 md:block md:w-[30%]'>
        <p className='mb-4 text-xl font-bold'>Quick Dial</p>

        <Dialer full useMock={useMock} />
      </div>
    );
  }

  if (!quickDial) return null;

  return (
    <div className='mt-4 hidden pr-4 md:block md:w-[30%]'>
      <p className='mb-4 text-xl font-bold'>Quick Dial</p>

      <Dialer full useMock={useMock} />
    </div>
  );
}
