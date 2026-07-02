'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconX,
  IconArrowRight,
  IconRocket
} from '@tabler/icons-react';
import type { SetupState, SetupActionKey } from '../lib/setup-steps';

const COLLAPSE_KEY = 'infra.checklistCollapsed';

/**
 * "Next best steps" for getting a workspace calling. Premium, floating,
 * collapsible, and self-completing: every row reflects real infrastructure, so
 * it ticks off as the user builds. The canvas decides when to show it (nodes
 * exist, setup incomplete, not dismissed); this owns collapse + interactions.
 */
export function SetupChecklist({
  state,
  templateLabel,
  onStepAction,
  onDismiss
}: {
  state: SetupState;
  templateLabel?: string | null;
  onStepAction: (key: SetupActionKey) => void;
  onDismiss: () => void;
}) {
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // ignore
    }
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });

  const firstPending = state.steps.find((s) => !s.done);
  const title = templateLabel ? `${templateLabel} setup` : 'Call center setup';
  const pct = Math.round((state.doneCount / state.total) * 100);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className='absolute top-4 left-4 z-20 w-72 max-w-[calc(100%-2rem)]'
    >
      <div className='bg-card/90 overflow-hidden rounded-2xl border shadow-xl ring-1 ring-white/5 backdrop-blur-xl'>
        <div className='flex items-center gap-2 px-3.5 py-2.5'>
          <span className='bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg'>
            <IconRocket className='size-4' />
          </span>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-xs font-semibold'>{title}</p>
            <p className='text-muted-foreground text-[11px]'>
              {state.doneCount} of {state.total} done
            </p>
          </div>
          <button
            type='button'
            onClick={toggle}
            aria-label={collapsed ? 'Expand checklist' : 'Collapse checklist'}
            className='text-muted-foreground hover:text-foreground transition-colors'
          >
            {collapsed ? (
              <IconChevronDown className='size-4' />
            ) : (
              <IconChevronUp className='size-4' />
            )}
          </button>
          <button
            type='button'
            onClick={onDismiss}
            aria-label='Dismiss setup checklist'
            className='text-muted-foreground hover:text-foreground transition-colors'
          >
            <IconX className='size-4' />
          </button>
        </div>

        <div className='bg-muted h-1 w-full'>
          <div
            className='bg-primary h-full transition-[width] duration-500 ease-out'
            style={{ width: `${pct}%` }}
          />
        </div>

        <AnimatePresence initial={false}>
          {!collapsed ? (
            <motion.ul
              key='steps'
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className='overflow-hidden p-1.5'
            >
              {state.steps.map((step, i) => {
                const isNext = firstPending?.key === step.key;
                return (
                  <li key={step.key}>
                    <button
                      type='button'
                      disabled={step.done}
                      onClick={() => onStepAction(step.key)}
                      className={cn(
                        'group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors',
                        step.done
                          ? 'cursor-default opacity-60'
                          : 'hover:bg-accent/50',
                        isNext && 'bg-primary/[0.06] ring-primary/15 ring-1'
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                          step.done
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                            : isNext
                              ? 'border-primary/50 text-primary'
                              : 'text-muted-foreground'
                        )}
                      >
                        {step.done ? <IconCheck className='size-3' /> : i + 1}
                      </span>
                      <span className='min-w-0 flex-1'>
                        <span
                          className={cn(
                            'block truncate text-xs font-medium',
                            step.done && 'line-through'
                          )}
                        >
                          {step.label}
                        </span>
                        {isNext ? (
                          <span className='text-muted-foreground block truncate text-[11px]'>
                            {step.hint}
                          </span>
                        ) : null}
                      </span>
                      {!step.done ? (
                        <IconArrowRight className='size-3.5 shrink-0 text-transparent transition-colors group-hover:text-current' />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
