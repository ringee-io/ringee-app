'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Avatar,
  AvatarFallback,
  AvatarImage
} from '@ringee/frontend-shared/components/ui/avatar';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { getInitials } from '@/features/calls/lib/initials';
import type { ContactListPerson } from '../types';

const DATE_FORMATS = {
  date: { dateStyle: 'medium' },
  dateTime: { dateStyle: 'medium', timeStyle: 'short' }
} satisfies Record<string, Intl.DateTimeFormatOptions>;

/**
 * A date in the reader's own time zone. next-intl formats in UTC on the
 * server, so this formats on the client only, once it has mounted.
 */
export function LocalDate({
  value,
  format = 'date'
}: {
  value: string;
  format?: keyof typeof DATE_FORMATS;
}) {
  const locale = useLocale();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    setText(
      new Intl.DateTimeFormat(locale, DATE_FORMATS[format]).format(
        new Date(value)
      )
    );
  }, [locale, value, format]);

  return <time dateTime={value}>{text}</time>;
}

/** How a person is named on a list: their name, else their email. */
export function usePersonName() {
  const t = useTranslations('lists');
  return (person: ContactListPerson | null) =>
    person
      ? person.name || person.email || t('formerMember')
      : t('formerMember');
}

/** Avatar and name of whoever created or works a list. */
export function PersonChip({
  person,
  className
}: {
  person: ContactListPerson | null;
  className?: string;
}) {
  const nameOf = usePersonName();
  const name = nameOf(person);

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <Avatar className='size-6 shrink-0'>
        {person?.imageUrl ? <AvatarImage src={person.imageUrl} alt='' /> : null}
        <AvatarFallback className='text-[10px] font-semibold'>
          {getInitials(name, '')}
        </AvatarFallback>
      </Avatar>
      <span className='truncate'>{name}</span>
    </span>
  );
}
