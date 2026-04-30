'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  IconAlertCircle,
  IconLoader2,
  IconX,
  IconGripVertical
} from '@tabler/icons-react';

interface WidgetShellProps {
  title: string;
  loading?: boolean;
  error?: Error | null;
  empty?: boolean;
  emptyHint?: string;
  onRemove?: () => void;
  /**
   * If true, the title row exposes a drag handle for the layout grid.
   */
  draggable?: boolean;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

export function WidgetShell({
  title,
  loading,
  error,
  empty,
  emptyHint,
  onRemove,
  draggable = true,
  className,
  contentClassName,
  children
}: WidgetShellProps) {
  return (
    <Card className={['flex h-full flex-col overflow-hidden', className].filter(Boolean).join(' ')}>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 px-4 py-3'>
        <div className='flex items-center gap-2'>
          {draggable && (
            <span
              className='widget-drag-handle text-muted-foreground hover:text-foreground cursor-move'
              aria-label='Drag widget'
            >
              <IconGripVertical size={16} />
            </span>
          )}
          <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        </div>
        {onRemove && (
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7'
            onClick={onRemove}
            aria-label='Remove widget'
          >
            <IconX size={14} />
          </Button>
        )}
      </CardHeader>
      <CardContent
        className={[
          'flex-1 overflow-auto px-4 pb-4',
          contentClassName
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {loading ? (
          <div className='text-muted-foreground flex h-full items-center justify-center gap-2 text-sm'>
            <IconLoader2 className='animate-spin' size={16} />
            Loading…
          </div>
        ) : error ? (
          <div className='flex h-full items-center justify-center gap-2 text-sm text-red-600'>
            <IconAlertCircle size={16} />
            {error.message || 'Failed to load'}
          </div>
        ) : empty ? (
          <div className='text-muted-foreground flex h-full flex-col items-center justify-center text-center text-sm'>
            <p className='font-medium'>Nothing to show yet</p>
            {emptyHint && <p className='mt-1 max-w-sm text-xs'>{emptyHint}</p>}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
