'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Users } from 'lucide-react';
import { useOrganization } from '@clerk/nextjs';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@ringee/frontend-shared/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useTranslations } from 'next-intl';

interface MemberSelectorProps {
  value: string | null;
  onChange: (memberId: string | null, memberName: string | null) => void;
}

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  imageUrl?: string;
}

export function MemberSelector({ value, onChange }: MemberSelectorProps) {
  const t = useTranslations('dashboard.overview.memberSelector');
  const [open, setOpen] = React.useState(false);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [, setError] = React.useState(false);
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const { isOrgAdmin, hasOrg, isLoaded: isRoleLoaded } = useOrgRole();
  const api = useApi();

  const orgId = organization?.id;

  React.useEffect(() => {
    if (!isOrgLoaded || !isRoleLoaded) return;
    if (!hasOrg || !isOrgAdmin || !organization) {
      setMembers([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(false);

    organization
      .getMemberships()
      .then(async (res) => {
        if (!active) return;

        const clerkUserIds = res.data
          .map((m) => m.publicUserData?.userId)
          .filter(Boolean) as string[];

        if (clerkUserIds.length === 0) {
          setMembers([]);
          return;
        }

        const dbUserMap = await api.get<{ clerkId: string; id: string }[]>(
          `/user/by-clerk-ids?ids=${clerkUserIds.join(',')}`
        );

        const clerkToDbId = new Map(dbUserMap.map((u) => [u.clerkId, u.id]));

        setMembers(
          res.data.map((m) => {
            const clerkUserId = m.publicUserData?.userId || '';
            return {
              id: m.id,
              userId: clerkToDbId.get(clerkUserId) || '',
              name:
                `${m.publicUserData?.firstName || ''} ${m.publicUserData?.lastName || ''}`.trim() ||
                t('unknown'),
              email: m.publicUserData?.identifier || '',
              imageUrl: m.publicUserData?.imageUrl
            };
          })
        );
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setMembers([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [orgId, isOrgLoaded, isRoleLoaded, hasOrg, isOrgAdmin, organization]);

  if (!hasOrg || !isOrgAdmin) {
    return null;
  }

  const selectedMember = members.find((m) => m.userId === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          className='w-[250px] justify-between'
          disabled={loading}
        >
          {loading ? (
            t('loading')
          ) : value ? (
            <span className='truncate'>
              {selectedMember?.name || t('member')}
            </span>
          ) : (
            <>
              <Users className='mr-2 h-4 w-4' />
              {t('allMembers')}
            </>
          )}
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[250px] p-0'>
        <Command>
          <CommandInput placeholder={t('search')} />
          <CommandList>
            <CommandEmpty>{t('noMembers')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value='all'
                onSelect={() => {
                  onChange(null, null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === null ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <Users className='mr-2 h-4 w-4' />
                {t('allMembers')}
              </CommandItem>
              {members.map((member) => (
                <CommandItem
                  key={member.id}
                  value={member.name}
                  onSelect={() => {
                    onChange(member.userId, member.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === member.userId ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className='flex flex-col'>
                    <span className='truncate'>{member.name}</span>
                    <span className='text-muted-foreground truncate text-xs'>
                      {member.email}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
