'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@ringee/frontend-shared/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useBackofficeApi, type AccountType } from '../api';
import {
  NO_ACCOUNT_FILTER,
  PERSONAL_ORGANIZATION_ID,
  type AccountFilter,
  type AccountFilterOption
} from '../lib/account-filter';

const RESULT_LIMIT = 20;

interface PickerOption extends AccountFilterOption {
  detail: string | null;
}

/**
 * Searchable single-select over the backoffice account list. Results come from
 * the server (`GET /backoffice/accounts?search=`), so it scales past what a
 * plain select could hold.
 */
function AccountPicker({
  type,
  value,
  onChange,
  allLabel,
  searchPlaceholder
}: {
  type: AccountType;
  value: AccountFilterOption | null;
  onChange: (value: AccountFilterOption | null) => void;
  allLabel: string;
  searchPlaceholder: string;
}) {
  const api = useBackofficeApi();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const handle = window.setTimeout(() => {
      setLoading(true);
      api
        .listAccounts({
          type,
          search: query.trim() || undefined,
          pageSize: RESULT_LIMIT
        })
        .then((res) => {
          if (!active) return;
          setResults(
            res.items.map((item) => ({
              id: item.id,
              name: item.name,
              detail: type === 'user' ? item.email : item.slug
            }))
          );
        })
        .catch(() => active && setResults([]))
        .finally(() => active && setLoading(false));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [api, open, query, type]);

  const select = (option: AccountFilterOption | null) => {
    onChange(option);
    setOpen(false);
    setQuery('');
  };

  const showPersonal =
    type === 'org' &&
    (!query.trim() || 'personal'.includes(query.trim().toLowerCase()));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal sm:w-64',
            !value && 'text-muted-foreground'
          )}
        >
          <span className='truncate'>{value ? value.name : allLabel}</span>
          <ChevronsUpDown className='size-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-(--radix-popover-trigger-width) min-w-64 p-0'>
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder}
          />
          <CommandList>
            {loading && results.length === 0 ? (
              <div className='text-muted-foreground flex items-center justify-center gap-2 py-6 text-xs'>
                <Loader2 className='size-3.5 animate-spin' /> Searching…
              </div>
            ) : (
              <>
                <CommandEmpty>No matches.</CommandEmpty>
                <CommandGroup>
                  <CommandItem value='__all__' onSelect={() => select(null)}>
                    <Check className={cn('size-4', value ? 'opacity-0' : '')} />
                    {allLabel}
                  </CommandItem>
                  {showPersonal && (
                    <CommandItem
                      value={PERSONAL_ORGANIZATION_ID}
                      onSelect={() =>
                        select({
                          id: PERSONAL_ORGANIZATION_ID,
                          name: 'Personal (no organization)'
                        })
                      }
                    >
                      <Check
                        className={cn(
                          'size-4',
                          value?.id === PERSONAL_ORGANIZATION_ID
                            ? ''
                            : 'opacity-0'
                        )}
                      />
                      Personal (no organization)
                    </CommandItem>
                  )}
                  {results.map((option) => (
                    <CommandItem
                      key={option.id}
                      value={option.id}
                      onSelect={() =>
                        select({ id: option.id, name: option.name })
                      }
                    >
                      <Check
                        className={cn(
                          'size-4',
                          value?.id === option.id ? '' : 'opacity-0'
                        )}
                      />
                      <div className='min-w-0'>
                        <p className='truncate text-sm'>{option.name}</p>
                        {option.detail && option.detail !== option.name && (
                          <p className='text-muted-foreground truncate text-xs'>
                            {option.detail}
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
      </PopoverContent>
    </Popover>
  );
}

/** Organization + client pickers, shown under the date range on every page. */
export function AccountFilterBar({
  value,
  onChange
}: {
  value: AccountFilter;
  onChange: (value: AccountFilter) => void;
}) {
  const active = !!(value.organization || value.client);

  return (
    <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
      <AccountPicker
        type='org'
        value={value.organization}
        onChange={(organization) => onChange({ ...value, organization })}
        allLabel='All organizations'
        searchPlaceholder='Search organization…'
      />
      <AccountPicker
        type='user'
        value={value.client}
        onChange={(client) => onChange({ ...value, client })}
        allLabel='All clients'
        searchPlaceholder='Search client by name or email…'
      />
      {active && (
        <Button
          variant='ghost'
          size='sm'
          onClick={() => onChange(NO_ACCOUNT_FILTER)}
        >
          <X className='size-4' />
          Clear filters
        </Button>
      )}
    </div>
  );
}
