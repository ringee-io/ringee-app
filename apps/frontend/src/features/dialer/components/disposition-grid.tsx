'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import type { DispositionOption } from '../store/dialer-attempt.store';

interface Props {
  dispositions: DispositionOption[];
  selectedCode?: string | null;
  disabled?: boolean;
  onSelect: (disposition: DispositionOption) => void;
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
  className = 'grid grid-cols-2 gap-2'
}: Props) {
  return (
    <div className={className}>
      {dispositions.map((d) => {
        const selected = selectedCode === d.code;
        return (
          <Button
            key={d.code}
            type='button'
            variant={selected ? 'default' : 'outline'}
            size='sm'
            className='justify-start'
            disabled={disabled}
            style={
              selected && d.color
                ? { backgroundColor: d.color, borderColor: d.color }
                : d.color
                  ? { borderColor: `${d.color}60`, color: d.color }
                  : undefined
            }
            onClick={() => onSelect(d)}
          >
            {d.label}
          </Button>
        );
      })}
    </div>
  );
}
