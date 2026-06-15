'use client';

import Link from 'next/link';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import { Check, Clock, Copy, ExternalLink, X } from 'lucide-react';
import {
  ACTION_TYPE_LABELS,
  PRIORITY_COLORS,
  SOURCE_COLORS,
  STATUS_COLORS,
  contextLabel,
  PendingActionView
} from '../types';

interface Props {
  actions: PendingActionView[];
  onComplete: (id: string) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  showContext?: boolean;
}

export function PendingActionsTable({
  actions,
  onComplete,
  onDismiss,
  onSnooze,
  showContext = true
}: Props) {
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Contact</TableHead>
          <TableHead className='hidden md:table-cell'>
            Recommended action
          </TableHead>
          {showContext && (
            <TableHead className='hidden lg:table-cell'>Context</TableHead>
          )}
          <TableHead>Priority</TableHead>
          <TableHead className='hidden sm:table-cell'>Due</TableHead>
          <TableHead className='hidden lg:table-cell'>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className='text-right'>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {actions.map((a) => {
          const isOpen = a.status === 'pending' || a.status === 'snoozed';
          return (
            <TableRow key={a.id}>
              <TableCell>
                <div className='font-medium'>
                  {a.contact?.name || a.contact?.phoneNumber || 'Unknown'}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {a.contact?.company ||
                    a.call?.outcome?.replace(/_/g, ' ') ||
                    '—'}
                </div>
              </TableCell>

              <TableCell className='hidden md:table-cell'>
                <div className='font-medium'>
                  {ACTION_TYPE_LABELS[a.type] ?? a.type}
                </div>
                {a.reason && (
                  <div className='text-muted-foreground line-clamp-2 text-xs'>
                    {a.reason}
                  </div>
                )}
              </TableCell>

              {showContext && (
                <TableCell className='hidden lg:table-cell'>
                  <span className='text-muted-foreground text-sm'>
                    {contextLabel(a)}
                  </span>
                </TableCell>
              )}

              <TableCell>
                <Badge
                  variant='secondary'
                  className={PRIORITY_COLORS[a.priority] || ''}
                >
                  {a.priority}
                </Badge>
              </TableCell>

              <TableCell className='hidden sm:table-cell'>
                <span className='text-sm'>
                  {a.dueAt ? new Date(a.dueAt).toLocaleDateString() : '—'}
                </span>
              </TableCell>

              <TableCell className='hidden lg:table-cell'>
                <Badge
                  variant='secondary'
                  className={SOURCE_COLORS[a.source] || ''}
                >
                  {a.source === 'ai' ? 'AI' : a.source}
                </Badge>
              </TableCell>

              <TableCell>
                <Badge
                  variant='secondary'
                  className={STATUS_COLORS[a.status] || ''}
                >
                  {a.status}
                </Badge>
              </TableCell>

              <TableCell>
                <div className='flex items-center justify-end gap-1'>
                  {a.suggestedMessage && (
                    <Button
                      variant='ghost'
                      size='icon'
                      title='Copy suggested message'
                      onClick={() => copy(a.suggestedMessage!)}
                    >
                      <Copy className='h-4 w-4' />
                    </Button>
                  )}
                  {a.contactId && (
                    <Button
                      asChild
                      variant='ghost'
                      size='icon'
                      title='Open contact'
                    >
                      <Link href={`/dashboard/contact/${a.contactId}`}>
                        <ExternalLink className='h-4 w-4' />
                      </Link>
                    </Button>
                  )}
                  {isOpen && (
                    <>
                      <Button
                        variant='ghost'
                        size='icon'
                        title='Snooze'
                        onClick={() => onSnooze(a.id)}
                      >
                        <Clock className='h-4 w-4' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        title='Dismiss'
                        onClick={() => onDismiss(a.id)}
                      >
                        <X className='h-4 w-4' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        title='Complete'
                        onClick={() => onComplete(a.id)}
                      >
                        <Check className='h-4 w-4 text-emerald-600' />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
