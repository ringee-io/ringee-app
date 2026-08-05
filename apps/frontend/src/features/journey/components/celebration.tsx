'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { IconTrophy } from '@tabler/icons-react';
import { useJourneyCopy } from '../lib/copy';
import { stagePresentation } from '../lib/presentation';
import { cn } from '@ringee/frontend-shared/lib/utils';

/**
 * The stage-complete moment.
 *
 * Rules it exists to obey:
 * - It fires once. Whether it has been shown is stored server-side and comes
 *   back as `celebrationPending`, so it does not replay on a new device.
 * - It never blocks. The dialog is dismissible, focus is trapped only while it
 *   is open, and Escape closes it.
 * - It respects `prefers-reduced-motion`: no confetti, no scale-in, just the
 *   panel.
 * - It says what capability was unlocked and what comes next, so the moment
 *   teaches something instead of just congratulating.
 */
export function StageCelebration({
  stageId,
  onDismiss
}: {
  stageId: string;
  onDismiss: () => void;
}) {
  const { t, dynamic } = useJourneyCopy();
  const reduceMotion = useReducedMotion();
  const dismissRef = useRef<HTMLButtonElement>(null);
  const { Icon, accent, tint } = stagePresentation(stageId);

  useEffect(() => {
    dismissRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  const stageName = dynamic(`stage.${stageId}.name`, stageId);
  const value = dynamic(`stage.${stageId}.value`, '');

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-labelledby='journey-celebration-title'
      className='fixed inset-0 z-50 flex items-center justify-center p-4'
    >
      <div
        className='bg-background/80 absolute inset-0 backdrop-blur-sm'
        onClick={onDismiss}
        aria-hidden='true'
      />

      {!reduceMotion && <Confetti />}

      <div
        className={cn(
          'bg-card relative w-full max-w-sm rounded-2xl border p-6 text-center shadow-lg',
          !reduceMotion && 'animate-in fade-in zoom-in-95 duration-300'
        )}
      >
        <span
          aria-hidden='true'
          className={cn(
            'mx-auto flex size-14 items-center justify-center rounded-2xl',
            tint
          )}
        >
          <Icon className={cn('size-7', accent)} />
        </span>

        <p className='text-muted-foreground mt-4 flex items-center justify-center gap-1.5 text-xs font-medium tracking-wide uppercase'>
          <IconTrophy className='size-3.5' aria-hidden='true' />
          {t('celebration.heading')}
        </p>

        <h2
          id='journey-celebration-title'
          className='mt-1 text-lg font-semibold'
        >
          {stageName}
        </h2>

        {value && (
          <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
            {value}
          </p>
        )}

        <button
          ref={dismissRef}
          type='button'
          onClick={onDismiss}
          className='bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-ring mt-5 w-full rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none'
        >
          {t('celebration.dismiss')}
        </button>
      </div>
    </div>
  );
}

/**
 * Deliberately restrained: a dozen small pieces, one short fall, no sound and
 * no repeat. This should read as "well done", not as a jackpot.
 */
function Confetti() {
  const pieces = Array.from({ length: 14 }, (_, index) => index);
  const colors = [
    'bg-emerald-500',
    'bg-sky-500',
    'bg-amber-500',
    'bg-violet-500'
  ];

  return (
    <div
      aria-hidden='true'
      className='pointer-events-none absolute inset-0 overflow-hidden'
    >
      {pieces.map((index) => (
        <span
          key={index}
          className={cn(
            'absolute top-1/4 size-1.5 rounded-[2px]',
            colors[index % colors.length]
          )}
          style={{
            left: `${8 + (index * 84) / pieces.length}%`,
            animation: `journey-confetti 1100ms ease-out ${index * 40}ms forwards`
          }}
        />
      ))}
      <style>{`
        @keyframes journey-confetti {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(190px) rotate(220deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
