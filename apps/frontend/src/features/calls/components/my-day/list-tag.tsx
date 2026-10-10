'use client';

import { useTranslations } from 'next-intl';
import { IconListDetails } from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { MyDayListRef } from '../../types/my-day';

/**
 * Which of the user's lists the person comes from, in small print. With
 * several, the list being called comes first and the rest are counted.
 */
export function ListTag({
  lists,
  preferredId,
  className
}: {
  lists: MyDayListRef[];
  /** The list "Call next" goes through, named first when it is one of them. */
  preferredId?: string | null;
  className?: string;
}) {
  const t = useTranslations('calls.myDay.list');
  if (lists.length === 0) return null;

  const ordered = preferredId
    ? [
        ...lists.filter((list) => list.id === preferredId),
        ...lists.filter((list) => list.id !== preferredId)
      ]
    : lists;
  const [first, ...rest] = ordered;

  return (
    <span
      className={cn(
        'text-muted-foreground inline-flex max-w-full min-w-0 items-center gap-1 text-xs',
        className
      )}
      title={ordered.map((list) => list.name).join(', ')}
    >
      <IconListDetails className='size-3.5 shrink-0' aria-hidden />
      <span className='sr-only'>{t('inLists')}</span>
      <span className='truncate'>{first!.name}</span>
      {rest.length > 0 ? (
        <span className='shrink-0'>{t('more', { count: rest.length })}</span>
      ) : null}
    </span>
  );
}
