'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconChartHistogram } from '@tabler/icons-react';
import { SPRING } from '../../lib/motion';
import { USAGE_SECTIONS, type UsageSection } from './usage-sections';

/**
 * The secondary, contextual navigation for Usage. Deliberately lighter than the
 * primary Infra rail — a titled header plus soft, icon-led rows with a single
 * sliding active indicator (framer `layoutId`), so it reads as sub-navigation
 * of a premium workspace rather than a second heavy sidebar.
 */
export function UsageSidebar({
  active,
  onSelect
}: {
  active: UsageSection;
  onSelect: (section: UsageSection) => void;
}) {
  const reduce = useReducedMotion();

  return (
    <aside className='bg-card/30 hidden w-60 shrink-0 flex-col border-r md:flex'>
      <div className='px-4 pt-5 pb-4'>
        <div className='flex items-center gap-2.5'>
          <span className='bg-primary/15 text-primary ring-primary/20 flex size-8 shrink-0 items-center justify-center rounded-xl ring-1'>
            <IconChartHistogram className='size-4' />
          </span>
          <div className='min-w-0 leading-tight'>
            <p className='truncate text-sm font-semibold tracking-tight'>
              Usage
            </p>
            <p className='text-muted-foreground truncate text-[11px]'>
              Health, performance and spend
            </p>
          </div>
        </div>
      </div>

      <nav className='flex flex-col gap-0.5 px-3 pb-4'>
        {USAGE_SECTIONS.map((s) => {
          const on = s.id === active;
          const Icon = s.Icon;
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
                  layoutId='usage-nav-active'
                  transition={reduce ? { duration: 0 } : SPRING}
                  className='bg-primary/10 ring-primary/15 absolute inset-0 rounded-xl ring-1'
                />
              ) : (
                <span className='absolute inset-0 rounded-xl transition-colors group-hover:bg-white/[0.04]' />
              )}
              <span
                className={cn(
                  'relative flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                  on
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted/50 text-muted-foreground group-hover:text-foreground'
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
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

/** Horizontal fallback for the secondary nav on narrow (sub-`md`) viewports. */
export function UsageSectionTabs({
  active,
  onSelect
}: {
  active: UsageSection;
  onSelect: (section: UsageSection) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className='-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5'>
      {USAGE_SECTIONS.map((s) => {
        const on = s.id === active;
        const Icon = s.Icon;
        return (
          <button
            key={s.id}
            type='button'
            onClick={() => onSelect(s.id)}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              on
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {on ? (
              <motion.span
                layoutId='usage-nav-active-mobile'
                transition={reduce ? { duration: 0 } : SPRING}
                className='bg-primary/15 ring-primary/20 absolute inset-0 rounded-full ring-1'
              />
            ) : null}
            <Icon className='relative size-3.5' />
            <span className='relative whitespace-nowrap'>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
