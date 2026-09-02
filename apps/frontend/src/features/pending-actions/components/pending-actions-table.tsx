'use client';

import Link from 'next/link';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import {
  TableActionCell,
  TableActionHead
} from '@ringee/frontend-shared/components/ui/table/table-action-column';
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
  PRIORITY_COLORS,
  SOURCE_COLORS,
  STATUS_COLORS,
  PendingActionView
} from '../types';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('ai.pendingActions');
  const tCommon = useTranslations('common');
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columns.contact')}</TableHead>
          <TableHead className='hidden md:table-cell'>
            {t('columns.recommendedAction')}
          </TableHead>
          {showContext && (
            <TableHead className='hidden lg:table-cell'>
              {t('columns.context')}
            </TableHead>
          )}
          <TableHead>{t('columns.priority')}</TableHead>
          <TableHead className='hidden sm:table-cell'>
            {t('columns.due')}
          </TableHead>
          <TableHead className='hidden lg:table-cell'>
            {t('columns.source')}
          </TableHead>
          <TableHead>{t('columns.status')}</TableHead>
          <TableActionHead>
            <span className='sr-only'>{t('columns.actions')}</span>
          </TableActionHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {actions.map((a) => {
          const isOpen = a.status === 'pending' || a.status === 'snoozed';
          return (
            <TableRow key={a.id}>
              <TableCell>
                <div className='font-medium'>
                  {a.contact?.name || a.contact?.phoneNumber || t('unknown')}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {a.contact?.company ||
                    a.call?.outcome?.replace(/_/g, ' ') ||
                    '—'}
                </div>
              </TableCell>

              <TableCell className='hidden md:table-cell'>
                <div className='font-medium'>{t(`actionTypes.${a.type}`)}</div>
                {a.reason && (
                  <div className='text-muted-foreground line-clamp-2 text-xs'>
                    {a.reason}
                  </div>
                )}
              </TableCell>

              {showContext && (
                <TableCell className='hidden lg:table-cell'>
                  <span className='text-muted-foreground text-sm'>
                    {a.contextType === 'campaign'
                      ? (a.campaign?.name ?? t('contexts.campaign'))
                      : t(`contexts.${a.contextType}`)}
                  </span>
                </TableCell>
              )}

              <TableCell>
                <Badge
                  variant='secondary'
                  className={PRIORITY_COLORS[a.priority] || ''}
                >
                  {t(`priorities.${a.priority}`)}
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
                  {t(`sources.${a.source}`)}
                </Badge>
              </TableCell>

              <TableCell>
                <Badge
                  variant='secondary'
                  className={STATUS_COLORS[a.status] || ''}
                >
                  {t(`statuses.${a.status}`)}
                </Badge>
              </TableCell>

              <TableActionCell>
                <TableRowActions
                  label={tCommon('openActions')}
                  menuLabel={t('columns.actions')}
                >
                  {a.suggestedMessage && (
                    <DropdownMenuItem onClick={() => copy(a.suggestedMessage!)}>
                      <Copy className='h-4 w-4' />
                      {t('actions.copyMessage')}
                    </DropdownMenuItem>
                  )}
                  {a.contactId && (
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/contact/${a.contactId}`}>
                        <ExternalLink className='h-4 w-4' />
                        {t('actions.openContact')}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isOpen && (
                    <>
                      {(a.suggestedMessage || a.contactId) && (
                        <DropdownMenuSeparator />
                      )}
                      <DropdownMenuItem onClick={() => onSnooze(a.id)}>
                        <Clock className='h-4 w-4' />
                        {t('actions.snooze')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDismiss(a.id)}>
                        <X className='h-4 w-4' />
                        {t('actions.dismiss')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onComplete(a.id)}>
                        <Check className='h-4 w-4 text-emerald-600' />
                        {t('actions.complete')}
                      </DropdownMenuItem>
                    </>
                  )}
                </TableRowActions>
              </TableActionCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
