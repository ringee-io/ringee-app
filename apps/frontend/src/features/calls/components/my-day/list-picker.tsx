'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, RotateCw, X } from 'lucide-react';
import { IconListDetails } from '@tabler/icons-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@ringee/frontend-shared/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { MyDayList } from '../../types/my-day';
import { Kbd } from './kbd';

interface ListPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: MyDayList[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  selectedId: string | null;
  /** The picked list, once it is known. */
  selected: MyDayList | null;
  onSelect: (listId: string | null) => void;
}

/**
 * Picks the list "Call next" goes through once nobody in today's queue is
 * due. Only the lists assigned to the user are offered — the server sends no
 * other.
 */
export function ListPicker({
  open,
  onOpenChange,
  lists,
  loading,
  failed,
  onRetry,
  selectedId,
  selected,
  onSelect
}: ListPickerProps) {
  const t = useTranslations('calls.myDay.list');

  function pick(listId: string | null) {
    onSelect(listId);
    onOpenChange(false);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          className={cn(
            'h-10 max-w-[15rem] min-w-0 shrink-0 gap-2 px-3 sm:px-3.5',
            selectedId &&
              'border-violet-300 bg-violet-50/60 dark:border-violet-500/40 dark:bg-violet-500/10'
          )}
          aria-keyshortcuts='L'
          aria-label={
            selected ? t('buttonWith', { name: selected.name }) : t('choose')
          }
        >
          <IconListDetails className='size-[18px] shrink-0' />
          <span className='hidden min-w-0 truncate sm:inline'>
            {selected?.name ?? t('button')}
          </span>
          <Kbd className='hidden sm:inline-flex'>L</Kbd>
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-80 p-0' aria-label={t('title')}>
        <div className='border-b px-3 py-2.5'>
          <p className='text-sm font-semibold'>{t('title')}</p>
          <p className='text-muted-foreground text-xs'>{t('hint')}</p>
        </div>

        {loading ? (
          <div className='space-y-2 p-3'>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        ) : failed ? (
          <div className='flex flex-col items-center gap-3 px-3 py-6 text-center'>
            <p className='text-sm'>{t('failed')}</p>
            <Button variant='outline' size='sm' onClick={onRetry}>
              <RotateCw />
              {t('retry')}
            </Button>
          </div>
        ) : lists.length === 0 ? (
          <div className='flex flex-col items-center px-4 py-6 text-center'>
            <p className='text-sm font-medium'>{t('none')}</p>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('noneHint')}
            </p>
            <Button asChild variant='outline' size='sm' className='mt-3'>
              <Link href='/dashboard/lists'>{t('openLists')}</Link>
            </Button>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder={t('search')} />
            <CommandList>
              <CommandEmpty>{t('noMatches')}</CommandEmpty>
              <CommandGroup heading={t('yours')}>
                {lists.map((list) => (
                  <CommandItem
                    key={list.id}
                    value={`${list.name} ${list.id}`}
                    onSelect={() => pick(list.id)}
                    className='items-start gap-2.5 py-2'
                  >
                    <Check
                      className={cn(
                        'mt-0.5',
                        list.id === selectedId ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate font-medium'>
                        {list.name}
                      </span>
                      <span className='text-muted-foreground block text-xs'>
                        {t('counts', {
                          remaining: list.remaining,
                          total: list.contactCount
                        })}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {selectedId ? (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem value={t('stop')} onSelect={() => pick(null)}>
                      <X />
                      {t('stop')}
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
