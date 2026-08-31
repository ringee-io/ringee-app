'use client';

import type { ReactNode } from 'react';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { cn } from '@ringee/frontend-shared/lib/utils';

/**
 * One control, framed the same way every time.
 *
 * The agent form mixes inputs, selects, textareas and buttons, and the fastest
 * way to make a form feel unfinished is to let those disagree on height, width
 * and corner radius. `controlClass` is the single answer to that — every
 * control in this feature wears it — and `Field` owns the label, the hint and
 * the error line so no two screens invent their own spacing.
 */

/** Height, width and radius shared by every input, select and trigger here. */
export const controlClass = 'h-10 w-full rounded-lg';

/**
 * The same, for a `SelectTrigger` — its own `data-[size]` rule is more specific
 * than a bare `h-10`, so the height has to be restated in that variant or the
 * select ends up a pixel shorter than the input beside it.
 */
export const selectTriggerClass = cn(controlClass, 'data-[size=default]:h-10');

/** Same radius and padding for a multi-line control, which sets its own height. */
export const textAreaClass = 'w-full rounded-lg px-3 py-2';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  action,
  className,
  children
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  /** The server's or the form's reason this value is not acceptable. */
  error?: string;
  required?: boolean;
  /** A control that belongs next to the label, e.g. "Draft from website". */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className='flex min-h-6 items-center justify-between gap-2'>
        <Label htmlFor={htmlFor} className='text-sm font-medium'>
          {label}
          {required ? (
            <span className='text-muted-foreground ml-0.5' aria-hidden>
              *
            </span>
          ) : null}
        </Label>
        {action}
      </div>

      {children}

      {error ? (
        <p role='alert' className='text-destructive text-xs'>
          {error}
        </p>
      ) : hint ? (
        <p className='text-muted-foreground text-xs'>{hint}</p>
      ) : null}
    </div>
  );
}
