'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { SPRING } from '../lib/motion';
import { JOURNEY_SECTIONS, type JourneySection } from './journey-sections';

/**
 * The secondary, contextual navigation for Journey. It sits under the stage
 * header — the stage is the constant, these are the ways to look at it. A single
 * sliding indicator (framer `layoutId`) keeps the switch calm, and each row
 * carries a hint so the split is self-explanatory.
 */
export function JourneySidebar({
  active,
  onSelect,
  /** Per-section badge, e.g. the number of open actions. */
  counts
}: {
  active: JourneySection;
  onSelect: (section: JourneySection) => void;
  counts?: Partial<Record<JourneySection, number>>;
}) {
  const reduce = useReducedMotion();

  return (
    <aside className='bg-card/40 hidden w-60 shrink-0 self-start rounded-2xl border p-2 md:sticky md:top-0 md:block'>
      <nav className='flex flex-col gap-0.5'>
        {JOURNEY_SECTIONS.map((s) => {
          const on = s.id === active;
          const Icon = s.Icon;
          const count = counts?.[s.id];

          return (
            <button
              key={s.id}
              type='button'
              onClick={() => onSelect(s.id)}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors',
                on
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {on ? (
                <motion.span
                  layoutId='journey-nav-active'
                  transition={reduce ? { duration: 0 } : SPRING}
                  className='bg-primary/10 ring-primary/15 absolute inset-0 rounded-xl ring-1'
                />
              ) : (
                <span className='absolute inset-0 rounded-xl transition-colors group-hover:bg-black/[0.03] dark:group-hover:bg-white/[0.04]' />
              )}

              <span
                className={cn(
                  'relative flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                  on
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted/60 text-muted-foreground group-hover:text-foreground'
                )}
              >
                <Icon className='size-4' />
              </span>

              <span className='relative min-w-0 flex-1'>
                <span className='block truncate text-[13px] font-medium'>
                  {s.label}
                </span>
                <span className='text-muted-foreground block truncate text-[11px]'>
                  {s.description}
                </span>
              </span>

              {count ? (
                <span
                  className={cn(
                    'relative shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                    on
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

/** Horizontal fallback for the secondary nav on narrow (sub-`md`) viewports. */
export function JourneySectionTabs({
  active,
  onSelect,
  counts
}: {
  active: JourneySection;
  onSelect: (section: JourneySection) => void;
  counts?: Partial<Record<JourneySection, number>>;
}) {
  const reduce = useReducedMotion();

  return (
    <div className='-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5 md:hidden'>
      {JOURNEY_SECTIONS.map((s) => {
        const on = s.id === active;
        const Icon = s.Icon;
        const count = counts?.[s.id];

        return (
          <button
            key={s.id}
            type='button'
            onClick={() => onSelect(s.id)}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              on
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {on ? (
              <motion.span
                layoutId='journey-nav-active-mobile'
                transition={reduce ? { duration: 0 } : SPRING}
                className='bg-primary/15 ring-primary/20 absolute inset-0 rounded-full ring-1'
              />
            ) : null}
            <Icon className='relative size-3.5' />
            <span className='relative whitespace-nowrap'>{s.label}</span>
            {count ? (
              <span className='relative tabular-nums opacity-70'>{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
