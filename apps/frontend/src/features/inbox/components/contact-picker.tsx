'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@ringee/frontend-shared/components/ui/command';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useTranslations } from 'next-intl';
import { Loader2, User } from 'lucide-react';

export interface PickableContact {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  phoneNumber?: string | null;
  company?: string | null;
  email?: string | null;
}

export function contactLabel(c: PickableContact): string {
  return (
    c.fullName ||
    [c.firstName, c.lastName].filter(Boolean).join(' ') ||
    c.name ||
    c.phoneNumber ||
    'Contact'
  );
}

interface Props {
  onPick: (contact: PickableContact) => void;
  autoFocus?: boolean;
}

/**
 * Debounced contact search over GET /contacts?search=. Reused by the
 * "Link contact" action and the New Conversation dialog.
 */
export function ContactPicker({ onPick, autoFocus }: Props) {
  const t = useTranslations('inbox.contextPane');
  const api = useApi();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickableContact[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      setLoading(true);
      api
        .get<{ data: PickableContact[] }>(
          `/contacts?limit=8&search=${encodeURIComponent(query)}`
        )
        .then((res) => active && setResults(res?.data ?? []))
        .catch(() => active && setResults([]))
        .finally(() => active && setLoading(false));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [api, query]);

  const items = useMemo(() => results.slice(0, 8), [results]);

  return (
    <Command shouldFilter={false} className='rounded-md border'>
      <CommandInput
        autoFocus={autoFocus}
        value={query}
        onValueChange={setQuery}
        placeholder={t('searchContacts')}
      />
      <CommandList>
        {loading ? (
          <div className='text-muted-foreground flex items-center justify-center gap-2 py-6 text-xs'>
            <Loader2 className='h-3.5 w-3.5 animate-spin' /> {t('searching')}
          </div>
        ) : (
          <>
            <CommandEmpty>{t('noContacts')}</CommandEmpty>
            <CommandGroup>
              {items.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => onPick(c)}
                  className='flex items-center gap-2'
                >
                  <User className='text-muted-foreground h-4 w-4 shrink-0' />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm'>{contactLabel(c)}</p>
                    {c.phoneNumber && (
                      <p className='text-muted-foreground truncate text-xs'>
                        {c.phoneNumber}
                      </p>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}
