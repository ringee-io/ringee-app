'use client';

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';
import { useNow, useTranslations } from 'next-intl';
import {
  Loader2,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Search,
  X
} from 'lucide-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { normalize, type CountryCode } from '@ringee/dialer-core/phone';
import { getInitials } from '../../lib/initials';
import { Kbd } from './kbd';
import { useMyDayFormat } from './use-my-day-format';

interface ContactHit {
  id: string;
  name: string | null;
  phoneNumber: string;
  company: string | null;
}

interface RecentCall {
  id: string;
  direction: 'inbound' | 'outbound';
  fromNumber: string;
  toNumber: string;
  startedAt: string | null;
  contact?: { name?: string | null } | null;
}

type SearchOption =
  | { type: 'number'; phoneNumber: string }
  | { type: 'contact'; contact: ContactHit }
  | { type: 'recent'; call: RecentCall; phoneNumber: string };

export interface CallSearchHandle {
  focus: () => void;
}

interface CallSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Country a number typed without its code belongs to. */
  region: CountryCode;
  /** Resolves `true` when a call was placed. */
  onDial: (phoneNumber: string) => Promise<boolean>;
}

const PHONE_LIKE = /^[+\d\s().-]+$/;
const SEARCH_DELAY_MS = 250;

function optionPhone(option: SearchOption): string {
  return option.type === 'contact'
    ? option.contact.phoneNumber
    : option.phoneNumber;
}

/**
 * One field to reach anyone: a contact by name, company or number, or any
 * number typed out. Enter calls the highlighted result; empty, it offers the
 * last calls for a redial.
 */
export const CallSearch = forwardRef<CallSearchHandle, CallSearchProps>(
  function CallSearch({ query, onQueryChange, region, onDial }, ref) {
    const t = useTranslations('calls.myDay.search');
    const api = useApi();
    const now = useNow({ updateInterval: 60_000 });
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = useId();
    const [focused, setFocused] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [results, setResults] = useState<{
      term: string;
      hits: ContactHit[];
    } | null>(null);
    const [recents, setRecents] = useState<RecentCall[]>([]);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus()
    }));

    const trimmed = query.trim();
    const phoneLike = trimmed !== '' && PHONE_LIKE.test(trimmed);
    // Contacts store numbers in E.164: match the digits, not the formatting.
    const term = phoneLike ? trimmed.replace(/[\s().-]/g, '') : trimmed;
    const searchable = phoneLike
      ? term.replace(/\D/g, '').length >= 3
      : term.length >= 2;
    const dialable = phoneLike ? normalize(trimmed, region) : null;

    useEffect(() => {
      if (!searchable) return;
      let cancelled = false;
      const timer = window.setTimeout(async () => {
        try {
          const res = await api.get<{ data: ContactHit[] }>(
            `/contacts?search=${encodeURIComponent(term)}&page=1&limit=6`
          );
          if (cancelled) return;
          setResults({
            term,
            hits: (res?.data ?? []).map((contact) => ({
              id: contact.id,
              name: contact.name ?? null,
              phoneNumber: contact.phoneNumber,
              company: contact.company ?? null
            }))
          });
        } catch {
          if (!cancelled) setResults({ term, hits: [] });
        }
      }, SEARCH_DELAY_MS);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }, [api, searchable, term]);

    // Focused and empty, the field offers a redial of the last calls.
    useEffect(() => {
      if (!focused || trimmed !== '') return;
      let cancelled = false;
      api
        .get<{ data: RecentCall[] }>(
          '/telephony/calls?limit=5&page=1&userId=me'
        )
        .then((res) => {
          if (!cancelled) setRecents((res?.data ?? []).slice(0, 5));
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, [api, focused, trimmed]);

    const searching = searchable && results?.term !== term;
    const hits = useMemo(
      () => (searchable ? (results?.hits ?? []) : []),
      [searchable, results]
    );

    const options = useMemo<SearchOption[]>(() => {
      if (trimmed === '') {
        return recents.map((call) => ({
          type: 'recent',
          call,
          phoneNumber:
            call.direction === 'inbound' ? call.fromNumber : call.toNumber
        }));
      }
      return [
        ...(dialable
          ? [{ type: 'number', phoneNumber: dialable } as const]
          : []),
        ...hits
          .filter((contact) => contact.phoneNumber !== dialable)
          .map((contact) => ({ type: 'contact', contact }) as const)
      ];
    }, [trimmed, recents, dialable, hits]);

    // Typing puts the best match under Enter; an empty field picks nothing.
    useEffect(() => {
      setActiveIndex(trimmed === '' ? -1 : 0);
    }, [trimmed]);

    const noMatches =
      searchable && !searching && hits.length === 0 && !dialable;
    const incomplete = phoneLike && !dialable && hits.length === 0;
    const open =
      focused &&
      (options.length > 0 || (trimmed !== '' && (noMatches || incomplete)));

    async function choose(option: SearchOption) {
      const placed = await onDial(optionPhone(option));
      if (placed) {
        onQueryChange('');
        inputRef.current?.blur();
      }
    }

    function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const option =
          options[activeIndex] ??
          (dialable
            ? { type: 'number' as const, phoneNumber: dialable }
            : null);
        if (option) void choose(option);
      } else if (event.key === 'Escape') {
        if (query) {
          event.preventDefault();
          onQueryChange('');
        } else {
          inputRef.current?.blur();
        }
      }
    }

    const activeId =
      open && activeIndex >= 0 && activeIndex < options.length
        ? `${listId}-${activeIndex}`
        : undefined;

    return (
      <div className='relative min-w-0 flex-1'>
        <div className='bg-background focus-within:border-ring focus-within:ring-ring/50 flex h-10 items-center gap-2.5 rounded-lg border px-3.5 shadow-xs focus-within:ring-[3px]'>
          <Search className='text-muted-foreground size-[18px] shrink-0' />
          <input
            ref={inputRef}
            type='text'
            role='combobox'
            aria-label={t('label')}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete='list'
            aria-activedescendant={activeId}
            aria-keyshortcuts='/'
            autoComplete='off'
            spellCheck={false}
            placeholder={t('placeholder')}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            className='placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none'
          />
          {searching ? (
            <Loader2 className='text-muted-foreground size-4 shrink-0 animate-spin' />
          ) : null}
          {query ? (
            <button
              type='button'
              onClick={() => {
                onQueryChange('');
                inputRef.current?.focus();
              }}
              aria-label={t('clear')}
              className='text-muted-foreground hover:text-foreground -mr-1 rounded p-1'
            >
              <X className='size-4' />
            </button>
          ) : (
            <Kbd className='hidden sm:inline-flex'>/</Kbd>
          )}
        </div>

        {open ? (
          <div className='bg-popover text-popover-foreground absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border shadow-lg'>
            {options.length > 0 ? (
              <>
                {trimmed === '' ? (
                  <p className='text-muted-foreground px-3 pt-2.5 pb-1 text-xs font-semibold tracking-wider uppercase'>
                    {t('recent')}
                  </p>
                ) : null}
                <ul
                  id={listId}
                  role='listbox'
                  aria-label={trimmed === '' ? t('recent') : t('label')}
                  className='max-h-80 overflow-y-auto p-1'
                >
                  {options.map((option, index) => (
                    <li
                      key={
                        option.type === 'contact'
                          ? option.contact.id
                          : option.type === 'recent'
                            ? option.call.id
                            : 'number'
                      }
                      id={`${listId}-${index}`}
                      role='option'
                      aria-selected={index === activeIndex}
                      // Keep the focus in the field: a click picks, it does
                      // not blur the search away.
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => void choose(option)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2',
                        index === activeIndex && 'bg-accent'
                      )}
                    >
                      <SearchOptionBody
                        option={option}
                        now={now}
                        active={index === activeIndex}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className='text-muted-foreground px-3 py-3 text-sm'>
                {incomplete
                  ? t('incompleteNumber')
                  : t('noMatches', { query: trimmed })}
              </p>
            )}
          </div>
        ) : null}
      </div>
    );
  }
);

/** One result: a number to call, a contact, or a recent call to redial. */
function SearchOptionBody({
  option,
  now,
  active
}: {
  option: SearchOption;
  now: Date;
  active: boolean;
}) {
  const t = useTranslations('calls.myDay.search');
  const fmt = useMyDayFormat();

  if (option.type === 'number') {
    return (
      <>
        <span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'>
          <Phone className='size-4' />
        </span>
        <span className='min-w-0 flex-1 truncate font-medium'>
          {t('callNumber', { number: fmt.phone(option.phoneNumber) })}
        </span>
        {active ? <Kbd>Enter</Kbd> : null}
      </>
    );
  }
  if (option.type === 'contact') {
    const { contact } = option;
    return (
      <>
        <span className='bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold'>
          {getInitials(contact.name, contact.phoneNumber)}
        </span>
        <span className='min-w-0 flex-1'>
          <span className='block truncate font-medium'>
            {contact.name || fmt.phone(contact.phoneNumber)}
          </span>
          {contact.company ? (
            <span className='text-muted-foreground block truncate text-xs'>
              {contact.company}
            </span>
          ) : null}
        </span>
        <span className='text-muted-foreground hidden shrink-0 font-mono text-xs tabular-nums sm:inline'>
          {fmt.phone(contact.phoneNumber)}
        </span>
        {active ? (
          <Kbd>Enter</Kbd>
        ) : (
          <Phone className='size-4 shrink-0 text-emerald-600 dark:text-emerald-400' />
        )}
      </>
    );
  }
  const { call } = option;
  const inbound = call.direction === 'inbound';
  const Icon = inbound ? PhoneIncoming : PhoneOutgoing;
  return (
    <>
      <Icon
        className={cn(
          'size-4 shrink-0',
          inbound ? 'text-emerald-600' : 'text-blue-600'
        )}
        aria-label={inbound ? t('inbound') : t('outbound')}
      />
      <span className='min-w-0 flex-1 truncate font-medium'>
        {call.contact?.name || fmt.phone(option.phoneNumber)}
      </span>
      {call.startedAt ? (
        <span className='text-muted-foreground shrink-0 text-xs'>
          {fmt.ago(new Date(call.startedAt), now)}
        </span>
      ) : null}
      {active ? (
        <Kbd>Enter</Kbd>
      ) : (
        <Phone className='size-4 shrink-0 text-emerald-600 dark:text-emerald-400' />
      )}
    </>
  );
}
