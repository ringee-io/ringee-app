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
    <div className='flex flex-wrap items-center gap-2'>
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

      {active === 'custom' && (
        <div className='flex items-center gap-2'>
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
            className='w-auto'
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
            className='w-auto'
          />
        </div>
      )}
    </div>
  );
}
