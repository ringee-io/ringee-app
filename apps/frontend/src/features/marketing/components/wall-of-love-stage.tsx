import type { CSSProperties, ReactNode } from 'react';
import { Heart } from 'lucide-react';

import {
  LinkedInMark,
  TrustpilotMark,
  WhatsAppMark,
  XMark
} from './wall-of-love-marks';
import styles from './wall-of-love.module.css';

/** The pill above the stage's title, on the page and in the takeover. */
export const STAGE_BADGE =
  'inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-4 py-1.5 text-sm font-medium text-neutral-700 backdrop-blur dark:border-white/15 dark:bg-white/5 dark:text-white/80';

/** What drifts up through the stage. Fixed values: the server and the browser
 *  must render the same thing. */
const RISING: {
  x: string;
  delay: string;
  duration: string;
  opacity: number;
  spin: string;
  mark: ReactNode;
}[] = [
  {
    x: '4%',
    delay: '0s',
    duration: '13s',
    opacity: 0.7,
    spin: '18deg',
    mark: <Heart className='h-5 w-5 fill-emerald-400 text-emerald-400' />
  },
  {
    x: '14%',
    delay: '-6s',
    duration: '16s',
    opacity: 0.45,
    spin: '-14deg',
    mark: <LinkedInMark className='h-5 w-5 text-[#4A9FEA]' />
  },
  {
    x: '23%',
    delay: '-2s',
    duration: '11s',
    opacity: 0.6,
    spin: '24deg',
    mark: <Heart className='h-3.5 w-3.5 fill-pink-400 text-pink-400' />
  },
  {
    x: '33%',
    delay: '-9s',
    duration: '15s',
    opacity: 0.4,
    spin: '-20deg',
    mark: <TrustpilotMark className='h-5 w-5' />
  },
  {
    x: '45%',
    delay: '-4s',
    duration: '18s',
    opacity: 0.35,
    spin: '12deg',
    mark: <Heart className='h-4 w-4 fill-cyan-300 text-cyan-300' />
  },
  {
    x: '57%',
    delay: '-11s',
    duration: '14s',
    opacity: 0.45,
    spin: '-16deg',
    mark: <WhatsAppMark className='h-5 w-5' />
  },
  {
    x: '66%',
    delay: '-1s',
    duration: '12s',
    opacity: 0.65,
    spin: '22deg',
    mark: <Heart className='h-5 w-5 fill-emerald-300 text-emerald-300' />
  },
  {
    x: '76%',
    delay: '-7s',
    duration: '17s',
    opacity: 0.4,
    spin: '-10deg',
    mark: <XMark className='h-4 w-4 text-neutral-900 dark:text-white' />
  },
  {
    x: '85%',
    delay: '-3s',
    duration: '13s',
    opacity: 0.6,
    spin: '20deg',
    mark: <Heart className='h-4 w-4 fill-pink-400 text-pink-400' />
  },
  {
    x: '94%',
    delay: '-10s',
    duration: '16s',
    opacity: 0.5,
    spin: '-22deg',
    mark: <Heart className='h-3.5 w-3.5 fill-emerald-400 text-emerald-400' />
  }
];

/**
 * The stage's moving backdrop: a drifting aurora in Ringee's greens over a
 * faint grid, with hearts and network marks rising through it. Decoration
 * only; it sits behind the content and takes no pointer events.
 */
export function WallStageBackdrop() {
  return (
    <div aria-hidden className={styles.backdrop}>
      <div className={styles.lines} />
      <div className={styles.aurora}>
        <span />
        <span />
        <span />
      </div>
      <div className={styles.rising}>
        {RISING.map(({ x, delay, duration, opacity, spin, mark }) => (
          <span
            key={x}
            style={
              {
                '--x': x,
                '--delay': delay,
                '--duration': duration,
                '--opacity': opacity,
                '--spin': spin
              } as CSSProperties
            }
          >
            {mark}
          </span>
        ))}
      </div>
    </div>
  );
}
