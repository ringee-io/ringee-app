'use client';

import { useTranslations } from 'next-intl';
import { CalendarDays, Check, ChevronDown, Settings } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { RingeeCalendar } from './types';

/**
 * Which calendars the grid, the month and Upcoming show. Calendars have no
 * colour of their own — colour says state here — so they are told apart by
 * name, and this filter is how one is looked at alone.
 */
export function CalendarFilter({
  calendars,
  hidden,
  onChange,
  onManage,
  open,
  onOpenChange
}: {
  calendars: RingeeCalendar[];
  hidden: Set<string>;
  onChange: (hidden: Set<string>) => void;
  onManage: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('meetings.page.filter');
  const tProvider = useTranslations('meetings.page.providers');
  const shown = calendars.filter((calendar) => !hidden.has(calendar.id));
  const filtered = shown.length !== calendars.length;
  const label = !filtered
    ? t('all')
    : shown.length === 1
      ? shown[0]!.name
      : t('some', { count: shown.length });

  const toggle = (id: string) => {
    if (!hidden.has(id) && shown.length === 1) {
      toast(t('atLeastOne'));
      return;
    }
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const only = (id: string) =>
    onChange(new Set(calendars.filter((c) => c.id !== id).map((c) => c.id)));

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          className={cn(
            'border-input dark:bg-input/30 hover:bg-accent/50 focus-visible:ring-ring/50 inline-flex h-8 max-w-[220px] shrink-0 items-center gap-[7px] rounded-md border bg-transparent px-2.5 text-sm font-medium outline-none focus-visible:ring-[3px]',
            filtered && 'border-foreground/40'
          )}
        >
          <CalendarDays className='text-muted-foreground size-3.5 shrink-0' />
          <span className='truncate'>{label}</span>
          <ChevronDown className='text-muted-foreground size-3.5 shrink-0' />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-72'>
        <div className='flex items-center justify-between px-2 pt-1 pb-1.5'>
          <span className='text-muted-foreground text-xs font-medium'>
            {t('title')}
          </span>
          {filtered ? (
            <button
              type='button'
              className='text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400'
              onClick={() => onChange(new Set())}
            >
              {t('showAll')}
            </button>
          ) : null}
        </div>
        {calendars.map((calendar) => {
          const on = !hidden.has(calendar.id);
          return (
            <DropdownMenuItem
              key={calendar.id}
              role='menuitemcheckbox'
              aria-checked={on}
              className='group items-start gap-2.5'
              onSelect={(event) => {
                event.preventDefault();
                toggle(calendar.id);
              }}
            >
              <span
                className={cn(
                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] border',
                  on
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-input'
                )}
                aria-hidden
              >
                {on ? <Check className='size-3 !text-white' /> : null}
              </span>
              <span className='grid min-w-0 flex-1'>
                <b className='truncate font-medium'>{calendar.name}</b>
                <span className='text-muted-foreground truncate text-xs'>
                  {calendar.integration
                    ? [
                        tProvider(calendar.integration.provider),
                        calendar.integration.email
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : t('onlyRingee')}
                </span>
              </span>
              {calendars.length > 1 ? (
                <span
                  role='button'
                  tabIndex={-1}
                  className='text-muted-foreground hover:text-foreground invisible shrink-0 text-xs font-medium group-hover:visible group-focus:visible'
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    only(calendar.id);
                  }}
                >
                  {t('only')}
                </span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onManage}>
          <Settings />
          {t('manage')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
