'use client';

import 'react-phone-number-input/style.css';
import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import PhoneInput, { type Value } from 'react-phone-number-input';
import type { CountryCode } from '@ringee/dialer-core/phone';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { cn } from '@ringee/frontend-shared/lib/utils';

/** One person being typed in. */
export interface PersonRow {
  key: string;
  /** E.164 as the field reads it; empty while blank. */
  phone: string;
  name: string;
  invalid: boolean;
}

/** More than this is a file's job — and Lists takes more later. */
export const MAX_TYPED_PEOPLE = 25;

let rowSeq = 0;

export function blankRow(): PersonRow {
  rowSeq += 1;
  return { key: `row-${rowSeq}`, phone: '', name: '', invalid: false };
}

type Field = 'phone' | 'name';

function focusField(root: HTMLElement | null, key: string, field: Field) {
  root
    ?.querySelector(`[data-row="${key}"]`)
    ?.querySelector<HTMLInputElement>(
      field === 'phone' ? 'input[type="tel"]' : 'input[data-field="name"]'
    )
    ?.focus();
}

/**
 * People typed in by hand: a number — with its country picker — and a name.
 * Enter moves along, and on the last name it starts the next person, so a
 * handful of numbers go in without touching the mouse.
 */
export function TypedPeople({
  rows,
  onRowsChange,
  defaultCountry,
  disabled
}: {
  rows: PersonRow[];
  onRowsChange: Dispatch<SetStateAction<PersonRow[]>>;
  /** Where a number typed without its country code belongs. */
  defaultCountry: CountryCode;
  disabled?: boolean;
}) {
  const t = useTranslations('onboarding.firstList.typed');
  const rootRef = useRef<HTMLDivElement>(null);
  /** A row just added, whose number takes the focus once it renders. */
  const added = useRef<string | null>(null);
  /** Where the cursor starts: the first number, when the step opens. */
  const opening = useRef(rows[0]?.key ?? null);

  useEffect(() => {
    if (opening.current) focusField(rootRef.current, opening.current, 'phone');
  }, []);

  useEffect(() => {
    if (!added.current) return;
    focusField(rootRef.current, added.current, 'phone');
    added.current = null;
  }, [rows]);

  const update = (key: string, patch: Partial<PersonRow>) =>
    onRowsChange((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );

  const add = () => {
    if (rows.length >= MAX_TYPED_PEOPLE) return;
    const row = blankRow();
    added.current = row.key;
    onRowsChange((current) => [...current, row]);
  };

  const remove = (key: string) => {
    const index = rows.findIndex((row) => row.key === key);
    const rest = rows.filter((row) => row.key !== key);
    const neighbour = rest[Math.min(index, rest.length - 1)];
    if (neighbour) added.current = neighbour.key;
    onRowsChange((current) => current.filter((row) => row.key !== key));
  };

  const atMax = rows.length >= MAX_TYPED_PEOPLE;

  return (
    <div ref={rootRef} className='space-y-2.5'>
      <div className='text-muted-foreground hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2.5rem] gap-2 px-0.5 text-xs font-medium sm:grid'>
        <span>{t('phone')}</span>
        <span>{t('name')}</span>
      </div>

      {rows.map((row, index) => (
        <div
          key={row.key}
          data-row={row.key}
          className='grid grid-cols-[minmax(0,1fr)_2.5rem] items-start gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2.5rem]'
        >
          <div className='min-w-0'>
            <PhoneInput
              international
              defaultCountry={defaultCountry}
              value={(row.phone || undefined) as Value | undefined}
              onChange={(value) =>
                update(row.key, { phone: value ?? '', invalid: false })
              }
              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                focusField(rootRef.current, row.key, 'name');
              }}
              disabled={disabled}
              aria-label={t('phoneOf', { index: index + 1 })}
              aria-invalid={row.invalid || undefined}
              className={cn(
                'border-input focus-within:border-ring focus-within:ring-ring/50 flex h-10 items-center rounded-md border bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] focus-within:ring-[3px] [&_input]:min-w-0 [&_input]:bg-transparent [&_input]:outline-none',
                row.invalid &&
                  'border-destructive focus-within:border-destructive focus-within:ring-destructive/20'
              )}
            />
            {row.invalid ? (
              <p className='text-destructive mt-1 text-xs'>{t('invalid')}</p>
            ) : null}
          </div>

          <Input
            data-field='name'
            value={row.name}
            onChange={(event) => update(row.key, { name: event.target.value })}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              const next = rows[index + 1];
              if (next) focusField(rootRef.current, next.key, 'phone');
              else add();
            }}
            placeholder={t('namePlaceholder')}
            aria-label={t('nameOf', { index: index + 1 })}
            maxLength={100}
            disabled={disabled}
            className='h-10 max-sm:col-start-1 max-sm:row-start-2'
          />

          <Button
            type='button'
            variant='ghost'
            size='icon'
            onClick={() => remove(row.key)}
            disabled={disabled || rows.length === 1}
            aria-label={t('remove', { index: index + 1 })}
            className='text-muted-foreground hover:text-foreground size-10 max-sm:col-start-2 max-sm:row-start-1'
          >
            <X className='size-4' />
          </Button>
        </div>
      ))}

      <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-0.5'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={add}
          disabled={disabled || atMax}
          className='-ml-2 gap-1.5 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300'
        >
          <Plus className='size-4' />
          {t('add')}
        </Button>
        <p className='text-muted-foreground text-xs'>
          {atMax ? t('max', { max: MAX_TYPED_PEOPLE }) : t('enterHint')}
        </p>
      </div>
    </div>
  );
}
