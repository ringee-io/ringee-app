'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import type { DispositionOption } from '../store/dialer-attempt.store';

interface Props {
  dispositions: DispositionOption[];
  selectedCode?: string | null;
  disabled?: boolean;
  onSelect: (disposition: DispositionOption) => void;
  /** Label the first nine buttons with the digit that picks them. */
  showShortcuts?: boolean;
  className?: string;
}

/**
 * The campaign's outcome buttons, coloured as the campaign configured them.
 * Shared by the live popup and the wrap-up panel so an agent is not learning
 * two different layouts of the same ten buttons.
 */
export function DispositionGrid({
  dispositions,
  selectedCode,
  disabled,
  onSelect,
  showShortcuts = false,
  className = 'grid grid-cols-2 gap-2'
}: Props) {
  return (
    <div className={className}>
      {dispositions.map((d, index) => {
        const selected = selectedCode === d.code;
        const shortcut = showShortcuts && index < 9 ? String(index + 1) : null;
        return (
          <Button
            key={d.code}
            type='button'
            variant={selected ? 'default' : 'outline'}
            size='sm'
            className='h-auto min-h-9 justify-start gap-2 py-1.5 text-left whitespace-normal'
            disabled={disabled}
            aria-pressed={selected}
            aria-keyshortcuts={shortcut ?? undefined}
            data-shortcut-passthrough=''
            style={
              selected && d.color
                ? { backgroundColor: d.color, borderColor: d.color }
                : d.color
                  ? { borderColor: `${d.color}60`, color: d.color }
                  : undefined
            }
            onClick={() => onSelect(d)}
          >
            {shortcut ? (
              <kbd className='bg-muted text-muted-foreground inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded border px-1 font-mono text-[10px] font-medium'>
                {shortcut}
              </kbd>
            ) : null}
            <span className='min-w-0'>{d.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
