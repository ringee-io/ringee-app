import { cn } from '@ringee/frontend-shared/lib/utils';
import type { ReactNode } from 'react';

/** The one surface every block on this page sits on. */
export function Panel({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-card/60 rounded-2xl border p-5 shadow-xs backdrop-blur-[2px]',
        className
      )}
    >
      {children}
    </div>
  );
}

/** Small uppercase label that introduces a block. */
export function GroupLabel({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'text-muted-foreground mb-2.5 text-[11px] font-medium tracking-[0.08em] uppercase',
        className
      )}
    >
      {children}
    </p>
  );
}

/**
 * A single-value progress meter. One hue, recessive track, rounded ends — the
 * value is always written next to it, so the bar is never the only carrier of
 * the number.
 */
export function Meter({
  value,
  tone,
  className
}: {
  /** 0-100. */
  value: number;
  /** Static Tailwind background class for the fill. */
  tone: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        'bg-muted h-1.5 w-full overflow-hidden rounded-full',
        className
      )}
      role='presentation'
    >
      <div
        className={cn('h-full rounded-full transition-[width]', tone)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * The readiness ring. A donut is the right form for one part-of-whole value with
 * a hero number in the middle — the number is what people read, the arc gives it
 * a glanceable sense of scale.
 */
export function ScoreRing({
  value,
  label,
  tone,
  size = 132
}: {
  /** 0-100. */
  value: number;
  label: string;
  /** Static Tailwind text colour class used for the arc. */
  tone: string;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;

  return (
    <div
      className='relative shrink-0'
      style={{ width: size, height: size }}
      role='img'
      aria-label={`${label}: ${pct} out of 100`}
    >
      <svg width={size} height={size} className='-rotate-90'>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          strokeWidth={stroke}
          className='stroke-muted'
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          strokeWidth={stroke}
          strokeLinecap='round'
          strokeDasharray={`${dash} ${circumference - dash}`}
          className={cn('stroke-current', tone)}
        />
      </svg>
      <div className='absolute inset-0 flex flex-col items-center justify-center'>
        <span className='text-2xl font-semibold tabular-nums'>{pct}%</span>
        <span className='text-muted-foreground mt-0.5 text-[10px] tracking-wide uppercase'>
          {label}
        </span>
      </div>
    </div>
  );
}
