'use client';

import { useEffect, useState } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import {
  Tabs,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import {
  useBackofficeApi,
  type AccountListItem,
  type AccountType
} from '../api';
import { errorMessage } from '../lib/format';

export interface PickedAccount {
  type: AccountType;
  id: string;
  name: string;
  /** Email for a user, slug for an organization. */
  detail: string | null;
}

const RESULTS = 6;

/** Search the users or organizations of the Accounts page and pick one. */
export function AccountPicker({
  value,
  onChange,
  disabled
}: {
  value: PickedAccount | null;
  onChange: (account: PickedAccount | null) => void;
  disabled?: boolean;
}) {
  const api = useBackofficeApi();
  const [type, setType] = useState<AccountType>('user');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<AccountListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.listAccounts({
          type,
          search: search.trim() || undefined,
          page: 1,
          pageSize: RESULTS
        });
        if (cancelled) return;
        setItems(res.items);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Failed to load accounts'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [api, type, search, value]);

  if (value) {
    return (
      <div className='flex items-center justify-between gap-3 rounded-md border px-3 py-2'>
        <div className='min-w-0'>
          <p className='truncate text-sm font-medium'>{value.name}</p>
          <p className='text-muted-foreground truncate text-xs'>
            {value.type === 'user' ? 'User' : 'Organization'}
            {value.detail ? ` · ${value.detail}` : ''}
          </p>
        </div>
        <Button
          type='button'
          size='sm'
          variant='ghost'
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <Tabs
          value={type}
          onValueChange={(v) => {
            setType(v as AccountType);
            setItems([]);
          }}
        >
          <TabsList className='w-full sm:w-fit'>
            <TabsTrigger value='user' disabled={disabled}>
              Users
            </TabsTrigger>
            <TabsTrigger value='org' disabled={disabled}>
              Organizations
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          placeholder={
            type === 'user' ? 'Search name or email…' : 'Search name or slug…'
          }
          value={search}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className='max-h-56 overflow-y-auto rounded-md border'>
        {loading && items.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            Loading…
          </p>
        ) : error ? (
          <p className='text-destructive py-6 text-center text-sm'>{error}</p>
        ) : items.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            No accounts found.
          </p>
        ) : (
          <ul className='divide-y'>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type='button'
                  disabled={disabled}
                  className='hover:bg-muted/50 focus-visible:bg-muted/50 w-full px-3 py-2 text-left outline-none disabled:opacity-50'
                  onClick={() =>
                    onChange({
                      type: item.type,
                      id: item.id,
                      name: item.name,
                      detail: item.email || item.slug
                    })
                  }
                >
                  <p className='truncate text-sm font-medium'>{item.name}</p>
                  <p className='text-muted-foreground truncate text-xs'>
                    {item.email || item.slug || item.id}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
