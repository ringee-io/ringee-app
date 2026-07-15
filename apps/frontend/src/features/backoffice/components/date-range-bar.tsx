'use client';

import { useState } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import {
  PRESETS,
  PresetKey,
  rangeForPreset,
  DateRange,
  toDateInputValue,
  fromDateInputValue
} from '../lib/date-presets';

export function DateRangeBar({
  value,
  onChange,
  initialPreset = '30d'
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  initialPreset?: PresetKey;
}) {
  const [active, setActive] = useState<PresetKey>(initialPreset);

  const handlePreset = (key: PresetKey) => {
    setActive(key);
    if (key !== 'custom') onChange(rangeForPreset(key));
  };

  return (
    <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
      <div className='grid grid-cols-3 gap-2 sm:flex sm:flex-wrap'>
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            size='sm'
            variant={active === p.key ? 'default' : 'outline'}
            onClick={() => handlePreset(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {active === 'custom' && (
        <div className='grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:w-auto'>
          <Input
            type='date'
            value={toDateInputValue(value.start)}
            max={toDateInputValue(value.end)}
            onChange={(e) =>
              onChange({
                ...value,
                start: fromDateInputValue(e.target.value)
              })
            }
            aria-label='Start date'
            className='w-full min-w-0 sm:w-auto'
          />
          <span className='text-muted-foreground text-sm'>to</span>
          <Input
            type='date'
            value={toDateInputValue(value.end)}
            min={toDateInputValue(value.start)}
            onChange={(e) =>
              onChange({
                ...value,
                end: fromDateInputValue(e.target.value, true)
              })
            }
            aria-label='End date'
            className='w-full min-w-0 sm:w-auto'
          />
        </div>
      )}
    </div>
  );
}
