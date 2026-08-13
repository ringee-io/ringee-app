'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Users, List, Mail, RefreshCw, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCrmMembers, useCrmLists } from '../../hooks/use-crm-connections';
import type { CrmProviderType } from '../../types/crm';
import { PROVIDER_META } from '../../types/crm';

export function TeamTab({
  connectionId,
  provider
}: {
  connectionId: string;
  provider: CrmProviderType;
}) {
  const {
    members,
    loading: membersLoading,
    reload: reloadMembers
  } = useCrmMembers(connectionId);
  const {
    lists,
    loading: listsLoading,
    reload: reloadLists
  } = useCrmLists(connectionId);
  const meta = PROVIDER_META[provider];
  const t = useTranslations('integrations.crm.team');
  const loading = membersLoading || listsLoading;

  const handleReload = () => {
    reloadMembers();
    reloadLists();
  };

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h3 className='text-sm font-semibold'>
            {t('title', { provider: meta.name })}
          </h3>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t('description', { provider: meta.name })}
          </p>
        </div>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleReload}
          disabled={loading}
          className='h-7 shrink-0'
        >
          <RefreshCw
            className={`mr-1.5 h-3 w-3 ${loading ? 'animate-spin' : ''}`}
          />
          {t('refresh')}
        </Button>
      </div>

      {/* Members */}
      <section className='space-y-3'>
        <div className='flex items-center gap-2'>
          <Users className='text-muted-foreground h-4 w-4' />
          <h4 className='text-sm font-medium'>{t('members')}</h4>
          {!membersLoading && (
            <Badge variant='secondary' className='text-[10px]'>
              {members.length}
            </Badge>
          )}
        </div>

        {membersLoading ? (
          <div className='space-y-2'>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className='h-12 w-full' />
            ))}
          </div>
        ) : members.length === 0 ? (
          <p className='text-muted-foreground py-4 text-center text-xs'>
            {t('noMembers')}
          </p>
        ) : (
          <div className='divide-y rounded-lg border'>
            {members.map((m) => (
              <div
                key={m.externalId}
                className='flex items-center gap-3 px-4 py-2.5'
              >
                <div className='bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full'>
                  <User className='text-muted-foreground h-3.5 w-3.5' />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium'>{m.name}</p>
                  <div className='text-muted-foreground flex items-center gap-1 text-xs'>
                    <Mail className='h-3 w-3' />
                    <span className='truncate'>{m.email}</span>
                  </div>
                </div>
                <span className='text-muted-foreground shrink-0 font-mono text-[10px]'>
                  {m.externalId.slice(0, 12)}…
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Lists */}
      <section className='space-y-3'>
        <div className='flex items-center gap-2'>
          <List className='text-muted-foreground h-4 w-4' />
          <h4 className='text-sm font-medium'>{t('lists')}</h4>
          {!listsLoading && (
            <Badge variant='secondary' className='text-[10px]'>
              {lists.length}
            </Badge>
          )}
        </div>

        {listsLoading ? (
          <div className='space-y-2'>
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className='h-12 w-full' />
            ))}
          </div>
        ) : lists.length === 0 ? (
          <p className='text-muted-foreground py-4 text-center text-xs'>
            {t('noLists')}
          </p>
        ) : (
          <div className='divide-y rounded-lg border'>
            {lists.map((l) => (
              <div
                key={l.externalId}
                className='flex items-center gap-3 px-4 py-2.5'
              >
                <div className='bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full'>
                  <List className='text-muted-foreground h-3.5 w-3.5' />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium'>{l.name}</p>
                  {l.type && (
                    <p className='text-muted-foreground text-xs'>{l.type}</p>
                  )}
                </div>
                <span className='text-muted-foreground shrink-0 font-mono text-[10px]'>
                  {l.externalId.slice(0, 12)}…
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
