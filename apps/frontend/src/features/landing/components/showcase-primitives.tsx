'use client';

/**
 * Shared animated building blocks for the landing "live" showcases
 * (agentic chat + dialer flows). Both sections reuse the same window chrome,
 * step-loop timing and tool-call chips so the product feels like one coherent
 * surface filmed from different angles.
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@ringee/frontend-shared/lib/utils';

/** Brand gradient used across the marketing site. */
export const BRAND_GRADIENT = 'from-amber-500 via-violet-500 to-cyan-500';

/**
 * Drives a looping step sequence, but only while the element is on-screen and
 * the visitor hasn't requested reduced motion. Pass a *stable* `durations`
 * array (declare it at module scope) so the timer isn't reset every render.
 * With reduced motion we pin to the final step so the story still reads.
 */
export function useStepLoop(
  length: number,
  durations: number[] | number,
  enabled = true
): number {
  const [step, setStep] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce || !enabled || length <= 1) return;
    const ms = Array.isArray(durations) ? (durations[step] ?? 1800) : durations;
    const id = setTimeout(() => setStep((s) => (s + 1) % length), ms);
    return () => clearTimeout(id);
  }, [step, length, durations, enabled, reduce]);

  // Restart cleanly whenever the loop is re-enabled (e.g. tab/mode switch).
  useEffect(() => {
    if (enabled) setStep(0);
  }, [enabled]);

  return reduce ? length - 1 : step;
}

/** `[ref, inView]` helper so showcases pause their animation off-screen. */
export function useInViewRef<T extends HTMLElement = HTMLDivElement>(
  amount = 0.3
) {
  const ref = useRef<T>(null);
  const inView = useInView(ref, { amount });
  return [ref, inView] as const;
}

type WindowChromeProps = {
  title: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  accent?: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
};

/** macOS-style window frame with a brand hairline under the title bar. */
export const WindowChrome = React.forwardRef<HTMLDivElement, WindowChromeProps>(
  function WindowChrome(
    {
      title,
      icon,
      badge,
      accent = BRAND_GRADIENT,
      className,
      bodyClassName,
      children
    },
    ref
  ) {
    return (
      <div
        ref={ref}
        className={cn(
          'border-border/60 bg-background/80 relative overflow-hidden rounded-2xl border shadow-2xl shadow-black/5 backdrop-blur-sm dark:shadow-black/40',
          className
        )}
      >
        <div className='border-border/60 bg-muted/40 flex items-center gap-2 border-b px-4 py-3'>
          <span className='h-2.5 w-2.5 rounded-full bg-rose-400/80' />
          <span className='h-2.5 w-2.5 rounded-full bg-amber-400/80' />
          <span className='h-2.5 w-2.5 rounded-full bg-emerald-400/80' />
          <div className='text-muted-foreground ml-2 flex min-w-0 items-center gap-1.5 text-xs font-medium'>
            {icon}
            <span className='truncate'>{title}</span>
          </div>
          {badge ? <div className='ml-auto'>{badge}</div> : null}
        </div>
        <div
          className={cn('h-px w-full bg-gradient-to-r opacity-80', accent)}
        />
        <div className={cn('relative', bodyClassName)}>{children}</div>
      </div>
    );
  }
);

/** Three bouncing dots used while an agent is "thinking". */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className='bg-muted-foreground/60 h-1.5 w-1.5 rounded-full'
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

/** Pulsing status dot — "running" pulses, "done" is solid. */
export function StatusDot({
  state,
  className
}: {
  state: 'running' | 'done' | 'idle';
  className?: string;
}) {
  if (state === 'running') {
    return (
      <span className={cn('relative flex h-2 w-2', className)}>
        <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75' />
        <span className='relative inline-flex h-2 w-2 rounded-full bg-amber-500' />
      </span>
    );
  }
  return (
    <span
      className={cn(
        'h-2 w-2 rounded-full',
        state === 'done' ? 'bg-emerald-500' : 'bg-muted-foreground/40',
        className
      )}
    />
  );
}

/**
 * A monospace MCP tool-call chip — `search_contacts ✓` — the visual signature
 * of the agent actually doing something rather than just chatting.
 */
export function ToolCallChip({
  name,
  state = 'done',
  label
}: {
  name: string;
  state?: 'running' | 'done';
  label?: string;
}) {
  return (
    <span className='border-border/70 bg-background/90 inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 font-mono text-[11px] shadow-sm'>
      <StatusDot state={state} />
      <span className='text-foreground/90'>{name}</span>
      {label ? (
        <span className='text-muted-foreground font-sans text-[10px]'>
          {label}
        </span>
      ) : null}
    </span>
  );
}

/** A soft, brand-tinted glow blob for section backgrounds. */
export function GlowBackground({
  className,
  gradient = 'from-violet-500/10 via-cyan-500/5 to-transparent'
}: {
  className?: string;
  gradient?: string;
}) {
  return (
    <div className='pointer-events-none absolute inset-0 -z-10' aria-hidden>
      <div
        className={cn(
          'absolute top-0 left-1/2 h-[340px] w-[760px] -translate-x-1/2 rounded-full bg-gradient-to-b blur-3xl',
          gradient,
          className
        )}
      />
    </div>
  );
}

/** Section kicker badge — pill with an icon, matching existing sections. */
export function Kicker({
  icon,
  children,
  className
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={cn(
        'mx-auto inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
        className
      )}
    >
      {icon}
      <span>{children}</span>
    </motion.div>
  );
}
