'use client';

import 'react-phone-number-input/style.css';
import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Grid3x3 } from 'lucide-react';
import PhoneInput, { type Value } from 'react-phone-number-input';
import {
  countryCallingCode,
  normalize,
  type CountryCode
} from '@ringee/dialer-core/phone';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { useCreditStore } from '@/features/credit/store/credit.store';
import { useDial } from '../../hooks/use.dial';
import { DialPad } from '../dialer.pad';
import { Kbd } from './kbd';

interface KeypadButtonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The search field's text: the keypad types into the same number. */
  query: string;
  onQueryChange: (query: string) => void;
  /** The dialing country: what the keypad's country picker shows. */
  country: CountryCode;
  onCountryChange: (country: CountryCode) => void;
  onDial: (phoneNumber: string) => Promise<boolean>;
}

const PHONE_LIKE = /^[+\d\s().-]*$/;

/**
 * The search text as the one international number the keypad edits: digits
 * typed without a country code take the dialing country's, and a name is no
 * number at all.
 */
function toInternational(text: string, country: CountryCode): string {
  const trimmed = text.trim();
  if (!trimmed || !PHONE_LIKE.test(trimmed)) return '';
  if (trimmed.startsWith('+')) return trimmed.replace(/[\s().-]/g, '');
  return (
    normalize(trimmed, country) ??
    `+${countryCallingCode(country)}${trimmed.replace(/\D/g, '')}`
  );
}

/**
 * The dialer's keypad over the page: the same phone field, with its country
 * picker, and the same tap-to-dial keys.
 */
export function KeypadButton({
  open,
  onOpenChange,
  query,
  onQueryChange,
  country,
  onCountryChange,
  onDial
}: KeypadButtonProps) {
  const t = useTranslations('calls.myDay.keypad');
  const tDialer = useTranslations('calls.dialer');
  const fieldRef = useRef<HTMLDivElement>(null);
  const { dialingNumber, onCall } = useDial();
  const { canAccessAdminFeatures, isLoaded: roleLoaded } = useOrgRole();
  const { balance, canCall, freeCallTrial } = useCreditStore();
  // Out of credit, the call key opens the credit popover, as on the dialer —
  // for whoever may see the balance at all.
  const showCreditPopover =
    roleLoaded &&
    canAccessAdminFeatures &&
    canCall &&
    !freeCallTrial &&
    balance <= 0;
  const number =
    query.startsWith('+') && PHONE_LIKE.test(query)
      ? query.replace(/[\s().-]/g, '')
      : '';

  async function call() {
    if (!number) return;
    await onDial(normalize(number, country) ?? number);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const international = toInternational(query, country);
          if (international !== query) onQueryChange(international);
        }
        onOpenChange(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          className='h-10 shrink-0 gap-2 px-3 sm:px-3.5'
          aria-keyshortcuts='K'
          aria-label={t('button')}
        >
          <Grid3x3 className='size-[18px]' />
          <span className='hidden sm:inline'>{t('button')}</span>
          <Kbd className='hidden sm:inline-flex'>K</Kbd>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        className='w-auto p-4'
        aria-label={t('title')}
        // Straight into the number, past the country picker: typing works
        // as soon as the keypad opens, and Enter calls.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          fieldRef.current?.querySelector('input')?.focus();
        }}
      >
        <div ref={fieldRef} className='mb-3 w-[15.25rem] space-y-1.5'>
          <PhoneInput
            international
            defaultCountry={country}
            onCountryChange={(next) => next && onCountryChange(next)}
            placeholder={tDialer('enterNumber')}
            value={(number || undefined) as Value | undefined}
            onChange={(value) => onQueryChange(value ?? '')}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void call();
            }}
            aria-label={tDialer('enterNumber')}
            className='bg-background w-full rounded-md border-none text-center text-lg tracking-widest focus:outline-none [&_input]:bg-transparent [&_input]:outline-none'
          />
          <p className='text-muted-foreground text-center text-xs'>
            {tDialer('enterToCall')}
          </p>
        </div>
        <DialPad
          compact
          number={number}
          setNumber={onQueryChange}
          onDelete={() => onQueryChange(number.slice(0, -1))}
          onCall={call}
          isCalling={dialingNumber !== null}
          callingDisabled={!canCall}
          disabledReason={onCall ? tDialer('alreadyOnCall') : undefined}
          country={country}
          showCreditPopover={showCreditPopover}
        />
      </PopoverContent>
    </Popover>
  );
}
