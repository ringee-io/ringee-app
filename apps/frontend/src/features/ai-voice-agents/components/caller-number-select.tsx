'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { flagEmoji } from '../lib/voice-format';
import type { VoiceAgentCallerNumber } from '../types';
import { selectTriggerClass } from './fields/field';

/**
 * The number an agent calls from, picked the same way in both places it is
 * asked for: on the agent's own settings, and on the trigger dialog when the
 * agent carries no number of its own.
 */

/** Radix cannot hold an empty `SelectItem` value, so "unset" needs a sentinel. */
const UNSET = '__unset';

export function CallerNumberSelect({
  id,
  numbers,
  value,
  onChange,
  placeholder,
  unsetLabel,
  invalid
}: {
  id?: string;
  numbers: VoiceAgentCallerNumber[];
  /** The chosen number's id; empty means nothing is chosen. */
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Offered as the first option wherever leaving the choice open is allowed. */
  unsetLabel?: string;
  invalid?: boolean;
}) {
  return (
    <Select
      value={value || (unsetLabel ? UNSET : '')}
      onValueChange={(next) => onChange(next === UNSET ? '' : next)}
    >
      <SelectTrigger
        id={id}
        className={selectTriggerClass}
        aria-invalid={invalid}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {unsetLabel ? (
          <SelectItem value={UNSET}>{unsetLabel}</SelectItem>
        ) : null}
        {numbers.map((number) => (
          <SelectItem key={number.id} value={number.id}>
            <span className='flex items-center gap-2'>
              <span aria-hidden>{flagEmoji(number.isoCountry)}</span>
              <span className='font-mono'>{number.phoneNumber}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
