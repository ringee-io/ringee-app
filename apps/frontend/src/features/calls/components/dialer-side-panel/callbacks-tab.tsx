'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  CalendarClock,
  ExternalLink,
  MoreHorizontal,
  Phone,
  User as UserIcon,
  X
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback
} from '@ringee/frontend-shared/components/ui/avatar';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useCallbackDial } from '../../hooks/use.callback.dial';
import {
  CALLBACK_STATUS_COLORS,
  type CallbackEntry,
  formatRelativeShort,
  formatUserName,
  getInitials,
  type RelativeT
} from './shared';

interface CallbacksTabProps {
  callbacks: CallbackEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function CallbacksTab({
  callbacks,
  loading,
  refresh
}: CallbacksTabProps) {
  const t = useTranslations('dialer.sidePanel.callbacks');
  const tRel = useTranslations('dialer.sidePanel.relative');
  const relativeT: RelativeT = (key, vars) => tRel(key, vars);
  const api = useApi();
  const { dialCallback, isBusy } = useCallbackDial();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCall(cb: CallbackEntry) {
    if (busyId || isBusy) return;
    setBusyId(cb.id);
    try {
      await dialCallback(cb);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(id: string) {
    try {
      await api.patch(`/callbacks/${id}/cancel`);
      await refresh();
    } catch {
      // best-effort
    }
  }

  if (loading) {
    return (
      <div className='space-y-2 p-3'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className='h-16 w-full' />
        ))}
      </div>
    );
  }

  if (callbacks.length === 0) {
    return (
      <div className='flex flex-col items-center px-4 py-10 text-center'>
        <CalendarClock className='text-muted-foreground mb-3 h-10 w-10' />
        <h3 className='text-sm font-semibold'>{t('emptyTitle')}</h3>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('emptyDescription')}
        </p>
      </div>
    );
  }

  return (
    <ul className='divide-border divide-y'>
      {callbacks.map((cb) => (
        <li key={cb.id} className='hover:bg-muted/40 px-3 py-2.5 transition'>
          <div className='flex items-start gap-3'>
            <Avatar className='size-9 shrink-0'>
              <AvatarFallback className='text-[10px] font-semibold'>
                {getInitials(cb.contact.name, cb.contact.phoneNumber)}
              </AvatarFallback>
            </Avatar>

            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <Link
                  href={`/dashboard/contacts/${cb.contactId}`}
                  target='_blank'
                  className='truncate text-sm font-medium hover:underline'
                >
                  {cb.contact.name || cb.contact.phoneNumber}
                </Link>
                <Badge
                  variant='secondary'
                  className={cn(
                    'h-4 px-1.5 text-[10px] font-medium capitalize',
                    CALLBACK_STATUS_COLORS[cb.status] || ''
                  )}
                >
                  {cb.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className='text-muted-foreground mt-0.5 flex items-center gap-2 text-xs'>
                <span className='font-mono'>{cb.contact.phoneNumber}</span>
                <span>·</span>
                <span>
                  {formatRelativeShort(new Date(cb.scheduledAt), relativeT)}
                </span>
              </div>
              {cb.note && (
                <p className='text-muted-foreground mt-1 line-clamp-1 text-xs italic'>
                  {cb.note}
                </p>
              )}
              <div className='text-muted-foreground mt-1 flex items-center gap-1 text-[10px]'>
                <UserIcon className='h-2.5 w-2.5 shrink-0' />
                <span className='truncate'>
                  {t('createdBy', {
                    name: formatUserName(cb.user, t('unknownUser'))
                  })}
                </span>
                {cb.campaignLead?.campaign?.name && (
                  <>
                    <span>·</span>
                    <span className='truncate'>
                      {cb.campaignLead.campaign.name}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className='flex shrink-0 items-center gap-1'>
              <Button
                size='icon'
                variant='ghost'
                disabled={busyId === cb.id || isBusy}
                onClick={() => handleCall(cb)}
                className='h-8 w-8 text-green-600 hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-500/20'
                title={t('actions.call')}
              >
                <Phone className='h-4 w-4' />
              </Button>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='text-muted-foreground h-8 w-8'
                  >
                    <MoreHorizontal className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/dashboard/contacts/${cb.contactId}`}
                      target='_blank'
                    >
                      <ExternalLink className='mr-2 h-3.5 w-3.5' />
                      {t('actions.viewContact')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleCancel(cb.id)}
                    className='text-red-600 focus:text-red-700'
                  >
                    <X className='mr-2 h-3.5 w-3.5' />
                    {t('actions.cancel')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
