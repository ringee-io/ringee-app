'use client';

import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import type {
  NumberRegistrationOutcome,
  NumberRegistrationResult
} from '../api';
import type { PickedAccount } from './account-picker';

const OUTCOME: Record<Exclude<NumberRegistrationOutcome, 'failed'>, string> = {
  added: 'Added',
  restored: 'Added back',
  existing: 'Already in Ringee'
};

export function registrationSucceeded(result: NumberRegistrationResult) {
  return result.outcome !== 'failed' && !result.error;
}

/** What happened to one number, as the server reported it. */
export function describeRegistration(
  result: NumberRegistrationResult,
  accountName: string | null
): string {
  if (result.error) return result.error;
  if (result.outcome === 'failed') return 'Could not add it';
  const label = OUTCOME[result.outcome];
  return result.assigned && accountName
    ? `${label} · assigned to ${accountName}`
    : label;
}

export function RegistrationResults({
  results,
  account
}: {
  results: NumberRegistrationResult[];
  account: PickedAccount | null;
}) {
  return (
    <ul className='max-h-72 divide-y overflow-y-auto rounded-md border'>
      {results.map((result, i) => {
        const ok = registrationSucceeded(result);
        const Icon = ok ? IconCircleCheck : IconAlertTriangle;
        return (
          <li
            key={`${i}-${result.phoneNumber}`}
            className='flex items-start gap-3 px-3 py-2'
          >
            <Icon
              className={
                ok
                  ? 'mt-0.5 size-4 shrink-0 text-emerald-600'
                  : 'text-destructive mt-0.5 size-4 shrink-0'
              }
            />
            <div className='min-w-0'>
              <p className='truncate font-mono text-sm'>{result.phoneNumber}</p>
              <p
                className={
                  ok
                    ? 'text-muted-foreground text-xs'
                    : 'text-destructive text-xs'
                }
              >
                {describeRegistration(result, account?.name ?? null)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
