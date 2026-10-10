'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCw, Search } from 'lucide-react';
import { formatForDisplay } from '@ringee/dialer-core/phone';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useDebounce } from '@ringee/frontend-shared/hooks/use-debounce';
import { cn } from '@ringee/frontend-shared/lib/utils';

/** The server takes this many contacts per request (`ADD_CONTACTS_MAX`). */
export const MAX_PICKED_CONTACTS = 500;

const PAGE_SIZE = 50;

interface ContactMatch {
  id: string;
  name: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber: string;
  company?: string | null;
}

export interface PickedContact {
  id: string;
  name: string;
}

/** The contact's name, when it has one. */
function givenName(contact: ContactMatch): string {
  return (
    contact.name?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ')
  );
}

function nameOf(contact: ContactMatch): string {
  return givenName(contact) || formatForDisplay(contact.phoneNumber);
}

/**
 * Contacts the workspace already has, most recently touched first, picked
 * with checkboxes. The pick survives a search, so several searches can fill
 * one list.
 */
export function ContactPicker({
  picked,
  onPickedChange,
  disabled
}: {
  picked: Map<string, PickedContact>;
  onPickedChange: Dispatch<SetStateAction<Map<string, PickedContact>>>;
  disabled?: boolean;
}) {
  const t = useTranslations('onboarding.firstList.contacts');
  const api = useApi();
  const [query, setQuery] = useState('');
  const search = useDebounce(query.trim(), 300);
  const [matches, setMatches] = useState<ContactMatch[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    api
      .get<{ data: ContactMatch[] }>('/contacts', {
        search: search || undefined,
        page: 1,
        limit: PAGE_SIZE
      })
      .then((res) => {
        if (active) setMatches(res?.data ?? []);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [api, search, attempt]);

  const shown = matches ?? [];
  const shownPicked = shown.filter((contact) => picked.has(contact.id)).length;
  const full = picked.size >= MAX_PICKED_CONTACTS;

  const toggle = (contact: ContactMatch) =>
    onPickedChange((current) => {
      const next = new Map(current);
      if (next.has(contact.id)) next.delete(contact.id);
      else if (next.size < MAX_PICKED_CONTACTS) {
        next.set(contact.id, { id: contact.id, name: nameOf(contact) });
      }
      return next;
    });

  const allShown = shown.length > 0 && shownPicked === shown.length;
  const toggleShown = () =>
    onPickedChange((current) => {
      const next = new Map(current);
      if (allShown) {
        for (const contact of shown) next.delete(contact.id);
      } else {
        for (const contact of shown) {
          if (next.size >= MAX_PICKED_CONTACTS) break;
          next.set(contact.id, { id: contact.id, name: nameOf(contact) });
        }
      }
      return next;
    });

  return (
    <div className='space-y-3'>
      <div className='relative'>
        <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2' />
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
          disabled={disabled}
          className='h-10 pl-9'
        />
      </div>

      <div className='overflow-hidden rounded-lg border'>
        <div className='bg-muted/40 flex items-center justify-between gap-3 border-b px-3 py-2'>
          <label className='flex cursor-pointer items-center gap-2.5 text-sm font-medium'>
            <Checkbox
              checked={allShown}
              onCheckedChange={toggleShown}
              disabled={disabled || shown.length === 0}
            />
            {t('selectShown')}
          </label>
          <span
            className={cn(
              'text-xs font-medium tabular-nums',
              picked.size > 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-muted-foreground'
            )}
            aria-live='polite'
          >
            {full
              ? t('full', { max: MAX_PICKED_CONTACTS })
              : t('selected', { count: picked.size })}
          </span>
        </div>

        <div className='max-h-[min(16rem,38vh)] overflow-y-auto'>
          {failed ? (
            <div className='flex flex-col items-center gap-3 px-4 py-8 text-center'>
              <p className='text-sm'>{t('failed')}</p>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setAttempt((n) => n + 1)}
              >
                <RotateCw />
                {t('retry')}
              </Button>
            </div>
          ) : matches === null ? (
            <div className='space-y-1 p-2'>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className='h-11 w-full' />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className='text-muted-foreground px-4 py-8 text-center text-sm'>
              {t('noMatches')}
            </p>
          ) : (
            <ul className='divide-y'>
              {shown.map((contact) => {
                const checked = picked.has(contact.id);
                return (
                  <li key={contact.id}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors',
                        checked
                          ? 'bg-emerald-50/70 dark:bg-emerald-500/[0.07]'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(contact)}
                        disabled={disabled || (!checked && full)}
                      />
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate text-sm font-medium'>
                          {nameOf(contact)}
                        </span>
                        <span className='text-muted-foreground block truncate text-xs'>
                          {[
                            givenName(contact)
                              ? formatForDisplay(contact.phoneNumber)
                              : null,
                            contact.company
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
