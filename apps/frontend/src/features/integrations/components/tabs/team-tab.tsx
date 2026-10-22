'use client';

import { useState } from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage
} from '@ringee/frontend-shared/components/ui/avatar';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { describeApiError } from '@ringee/frontend-shared/lib/api-error';
import {
  AlertCircle,
  List,
  Mail,
  RefreshCw,
  RotateCcw,
  User,
  Users
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  useCrmLists,
  useCrmMemberLinks
} from '../../hooks/use-crm-connections';
import type {
  CrmMemberLink,
  CrmOwnerRef,
  CrmProviderType
} from '../../types/crm';
import { PROVIDER_META } from '../../types/crm';
import {
  CrmMemberLinkPicker,
  type CrmMemberLinkChoice
} from '../crm-member-link-picker';

export function TeamTab({
  connectionId,
  provider
}: {
  connectionId: string;
  provider: CrmProviderType;
}) {
  const {
    view,
    loading: membersLoading,
    failed: membersFailed,
    reload: reloadMembers,
    link,
    unlink
  } = useCrmMemberLinks(connectionId);
  const {
    lists,
    loading: listsLoading,
    reload: reloadLists
  } = useCrmLists(connectionId);
  const meta = PROVIDER_META[provider];
  const t = useTranslations('integrations.crm.team');
  const loading = membersLoading || listsLoading;
  const ownerAssignment = view?.ownerAssignment ?? false;

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
            {ownerAssignment
              ? t('links.description', { provider: meta.name })
              : t('description', { provider: meta.name })}
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

      {membersLoading && !view ? (
        <section className='space-y-2'>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className='h-14 w-full' />
          ))}
        </section>
      ) : membersFailed || !view ? (
        <div className='flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center'>
          <p className='text-sm'>{t('links.loadFailed')}</p>
          <Button variant='outline' size='sm' onClick={reloadMembers}>
            <RefreshCw className='mr-1.5 h-3 w-3' />
            {t('refresh')}
          </Button>
        </div>
      ) : ownerAssignment ? (
        <MemberLinks
          members={view.members}
          crmMembers={view.crmMembers}
          crmMembersLoaded={view.crmMembersLoaded}
          providerName={meta.name}
          onLink={link}
          onUnlink={unlink}
        />
      ) : (
        <CrmMembers members={view.crmMembers} />
      )}

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

/**
 * Each Ringee member and the CRM user they are. What Ringee creates in the
 * CRM for a member — the contact their first call creates, the call — is
 * owned by that user.
 */
function MemberLinks({
  members,
  crmMembers,
  crmMembersLoaded,
  providerName,
  onLink,
  onUnlink
}: {
  members: CrmMemberLink[];
  crmMembers: CrmOwnerRef[];
  crmMembersLoaded: boolean;
  providerName: string;
  onLink: (userId: string, crmMemberId: string | null) => Promise<void>;
  onUnlink: (userId: string) => Promise<void>;
}) {
  const t = useTranslations('integrations.crm.team');
  const [saving, setSaving] = useState<string | null>(null);
  const linked = members.filter((m) => m.crmMember && !m.stale).length;

  const choose = async (member: CrmMemberLink, choice: CrmMemberLinkChoice) => {
    setSaving(member.userId);
    try {
      if (choice.kind === 'email') await onUnlink(member.userId);
      else
        await onLink(
          member.userId,
          choice.kind === 'user' ? choice.crmMemberId : null
        );
    } catch (err) {
      toast.error(describeApiError(err, t('links.toasts.error')));
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className='space-y-3'>
      <div className='flex items-center gap-2'>
        <Users className='text-muted-foreground h-4 w-4' />
        <h4 className='text-sm font-medium'>
          {t('links.title', { provider: providerName })}
        </h4>
        <Badge variant='secondary' className='text-[10px]'>
          {t('links.linkedCount', { linked, total: members.length })}
        </Badge>
      </div>

      {!crmMembersLoaded && (
        <div className='flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs'>
          <AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500' />
          <p>{t('links.crmUnavailable', { provider: providerName })}</p>
        </div>
      )}

      {members.length === 0 ? (
        <p className='text-muted-foreground py-4 text-center text-xs'>
          {t('links.empty')}
        </p>
      ) : (
        <div className='divide-y rounded-lg border'>
          {members.map((member) => (
            <MemberLinkRow
              key={member.userId}
              member={member}
              crmMembers={crmMembers}
              providerName={providerName}
              saving={saving === member.userId}
              onChoose={(choice) => choose(member, choice)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MemberLinkRow({
  member,
  crmMembers,
  providerName,
  saving,
  onChoose
}: {
  member: CrmMemberLink;
  crmMembers: CrmOwnerRef[];
  providerName: string;
  saving: boolean;
  onChoose: (choice: CrmMemberLinkChoice) => void;
}) {
  const t = useTranslations('integrations.crm.team.links');
  const display = member.name ?? member.email ?? '—';

  return (
    <div className='flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3'>
      <div className='flex min-w-0 flex-1 items-center gap-3'>
        <Avatar className='h-8 w-8'>
          {member.imageUrl && <AvatarImage src={member.imageUrl} alt='' />}
          <AvatarFallback className='text-xs'>
            {display.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className='min-w-0'>
          <p className='truncate text-sm font-medium'>{display}</p>
          {member.email && member.name && (
            <p className='text-muted-foreground truncate text-xs'>
              {member.email}
            </p>
          )}
        </div>
      </div>

      <div className='flex flex-col gap-1 sm:items-end'>
        <CrmMemberLinkPicker
          link={member}
          crmMembers={crmMembers}
          emailMatch={member.emailMatch}
          provider={providerName}
          saving={saving}
          onChoose={onChoose}
        />
        <LinkStatus
          member={member}
          providerName={providerName}
          saving={saving}
          onReset={() => onChoose({ kind: 'email' })}
        />
        {member.stale && (
          <p className='text-xs text-amber-600 dark:text-amber-500'>
            {t('stale', { provider: providerName })}
          </p>
        )}
      </div>
    </div>
  );
}

function LinkStatus({
  member,
  providerName,
  saving,
  onReset
}: {
  member: CrmMemberLink;
  providerName: string;
  saving: boolean;
  onReset: () => void;
}) {
  const t = useTranslations('integrations.crm.team.links');

  if (member.source === 'email') {
    return (
      <span className='text-muted-foreground flex items-center gap-1 text-xs'>
        <Mail className='h-3 w-3' />
        {member.crmMember
          ? t('auto')
          : t('noMatch', { provider: providerName })}
      </span>
    );
  }
  return (
    <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
      {t('manual')}
      <span aria-hidden>·</span>
      <button
        type='button'
        onClick={onReset}
        disabled={saving}
        className='text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline disabled:opacity-50'
      >
        <RotateCcw className='h-3 w-3' />
        {t('useEmail')}
      </button>
    </span>
  );
}

/** The CRM's users, read-only: for a CRM that does not assign owners yet. */
function CrmMembers({ members }: { members: CrmOwnerRef[] }) {
  const t = useTranslations('integrations.crm.team');
  return (
    <section className='space-y-3'>
      <div className='flex items-center gap-2'>
        <Users className='text-muted-foreground h-4 w-4' />
        <h4 className='text-sm font-medium'>{t('members')}</h4>
        <Badge variant='secondary' className='text-[10px]'>
          {members.length}
        </Badge>
      </div>

      {members.length === 0 ? (
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
  );
}
