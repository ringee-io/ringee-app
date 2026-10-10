'use client';

import { useEffect, useState } from 'react';
import { useNow } from 'next-intl';
import { useMyDayFormat } from './use-my-day-format';

/**
 * Today's date and time where the user is. Rendered after mount: the server
 * does not know the user's time zone, and a guess would flash the wrong day.
 */
export function TodayDate({ className }: { className?: string }) {
  const fmt = useMyDayFormat();
  const now = useNow({ updateInterval: 30_000 });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return <p className={className}>{mounted ? fmt.today(now) : '\u00a0'}</p>;
}
