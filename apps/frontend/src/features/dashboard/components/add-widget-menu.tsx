'use client';

import * as React from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { IconPlus } from '@tabler/icons-react';
import { WIDGET_CATALOG } from '../widgets/registry';
import type { WidgetType } from '../lib/types';

interface AddWidgetMenuProps {
  onAdd: (type: WidgetType, title: string, w: number, h: number) => void;
  existingTypes: Set<WidgetType>;
}

export function AddWidgetMenu({ onAdd, existingTypes }: AddWidgetMenuProps) {
  const grouped = React.useMemo(() => {
    return {
      KPI: WIDGET_CATALOG.filter((w) => w.category === 'KPI'),
      Chart: WIDGET_CATALOG.filter((w) => w.category === 'Chart'),
      Table: WIDGET_CATALOG.filter((w) => w.category === 'Table')
    };
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm' className='gap-1'>
          <IconPlus size={14} /> Add widget
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-72'>
        {(['KPI', 'Chart', 'Table'] as const).map((cat, idx) => (
          <React.Fragment key={cat}>
            {idx > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{cat} widgets</DropdownMenuLabel>
            {grouped[cat].map((w) => {
              const already = existingTypes.has(w.type);
              return (
                <DropdownMenuItem
                  key={w.type}
                  disabled={already}
                  onSelect={() =>
                    onAdd(w.type, w.defaultTitle, w.defaultSize.w, w.defaultSize.h)
                  }
                >
                  <div className='flex flex-col'>
                    <span className='text-sm font-medium'>{w.defaultTitle}</span>
                    <span className='text-muted-foreground text-xs'>{w.description}</span>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
