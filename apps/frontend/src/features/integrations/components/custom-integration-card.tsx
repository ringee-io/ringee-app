'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import {
  CheckCircle2,
  MoreVertical,
  PauseCircle,
  Plug,
  Trash2
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CustomIntegrationSummary } from '../types/custom-integrations';

interface Props {
  item: CustomIntegrationSummary;
  onConfigure: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

export function CustomIntegrationCard({ item, onConfigure, onDelete }: Props) {
  const t = useTranslations('integrations.custom.card');
  const subscribedCount = item.subscribedEvents.length;
  return (
    <div className='bg-card rounded-xl border p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <div className='bg-muted flex h-10 w-10 items-center justify-center rounded-lg'>
            <Plug className='text-muted-foreground h-5 w-5' />
          </div>
          <div className='min-w-0'>
            <h3 className='truncate text-sm font-semibold'>{item.name}</h3>
            <p className='text-muted-foreground truncate text-xs'>
              {item.apiKeyPrefix}…
            </p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          {item.status === 'active' ? (
            <Badge
              variant='outline'
              className='border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
            >
              <CheckCircle2 className='mr-1 h-3 w-3' /> {t('active')}
            </Badge>
          ) : (
            <Badge
              variant='outline'
              className='border-muted-foreground/30 text-muted-foreground'
            >
              <PauseCircle className='mr-1 h-3 w-3' /> {t('disabled')}
            </Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' className='h-7 w-7'>
                <MoreVertical className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => onConfigure(item.id)}>
                {t('configure')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className='text-red-500 focus:text-red-500'
                  >
                    <Trash2 className='mr-2 h-3.5 w-3.5' /> {t('delete')}
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('deleteDialog.title')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('deleteDialog.description')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {t('deleteDialog.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(item.id)}>
                      {t('deleteDialog.confirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <dl className='mt-4 grid grid-cols-3 gap-3 text-xs'>
        <div>
          <dt className='text-muted-foreground'>{t('outboundUrl')}</dt>
          <dd className='mt-0.5 truncate font-medium'>
            {item.outboundUrl ?? (
              <span className='text-muted-foreground'>
                {t('notConfigured')}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>{t('events')}</dt>
          <dd className='mt-0.5 font-medium'>{subscribedCount}</dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>{t('lastUsed')}</dt>
          <dd className='mt-0.5 font-medium'>
            {item.apiKeyLastUsedAt
              ? new Date(item.apiKeyLastUsedAt).toLocaleString()
              : t('never')}
          </dd>
        </div>
      </dl>
      <div className='mt-4 flex justify-end'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => onConfigure(item.id)}
        >
          {t('configure')}
        </Button>
      </div>
    </div>
  );
}
