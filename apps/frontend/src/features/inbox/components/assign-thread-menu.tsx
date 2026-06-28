'use client';

import { useEffect, useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Check, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { InboxThread } from '../types';
import { useThreadActions } from '../hooks/use-inbox';

interface Member {
  id: string;
  name: string;
}

interface Props {
  thread: InboxThread;
  onChanged: () => void;
}

/**
 * Assigns an inbox thread to an org member. Member list is resolved with the
 * same pattern as the dashboard filters (Clerk memberships → DB user ids).
 */
export function AssignThreadMenu({ thread, onChanged }: Props) {
  const t = useTranslations('inbox.assignment');
  const api = useApi();
  const { organization } = useOrganization();
  const [members, setMembers] = useState<Member[]>([]);
  const actions = useThreadActions(onChanged);

  useEffect(() => {
    if (!organization) return;
    let active = true;
    organization.getMemberships().then(async (res) => {
      const clerkIds = res.data
        .map((m) => m.publicUserData?.userId)
        .filter(Boolean) as string[];
      if (clerkIds.length === 0) {
        if (active) setMembers([]);
        return;
      }
      const map = await api.get<{ clerkId: string; id: string }[]>(
        `/user/by-clerk-ids?ids=${clerkIds.join(',')}`
      );
      if (!active) return;
      const lookup = new Map(map.map((u) => [u.clerkId, u.id]));
      setMembers(
        res.data
          .map((m) => {
            const clerkId = m.publicUserData?.userId || '';
            const name =
              `${m.publicUserData?.firstName || ''} ${m.publicUserData?.lastName || ''}`.trim() ||
              m.publicUserData?.identifier ||
              t('memberFallback');
            return { id: lookup.get(clerkId) || '', name };
          })
          .filter((m) => m.id)
      );
    });
    return () => {
      active = false;
    };
  }, [organization, api, t]);

  const assignee = members.find((m) => m.id === thread.assignedToId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm'>
          <UserPlus className='mr-1 h-4 w-4' />
          {assignee ? assignee.name : t('assign')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-56'>
        <DropdownMenuLabel>{t('assignTo')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => actions.assign(thread.id, null)}>
          <span className='flex-1'>{t('unassigned')}</span>
          {!thread.assignedToId && <Check className='h-4 w-4' />}
        </DropdownMenuItem>
        {members.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onClick={() => actions.assign(thread.id, m.id)}
          >
            <span className='flex-1 truncate'>{m.name}</span>
            {thread.assignedToId === m.id && <Check className='h-4 w-4' />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
