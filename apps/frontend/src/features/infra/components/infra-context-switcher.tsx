'use client';

import { useState } from 'react';
import { useOrganization, useOrganizationList, useUser } from '@clerk/nextjs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import {
  Avatar,
  AvatarFallback,
  AvatarImage
} from '@ringee/frontend-shared/components/ui/avatar';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  IconCheck,
  IconChevronDown,
  IconLoader2,
  IconUserBolt,
  IconUsersGroup
} from '@tabler/icons-react';
import { useInfraStore } from '../store/infra.store';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Infra-native workspace switcher. Drives Clerk's active organization — the same
 * mechanism the rest of Ringee uses (`setActive`) — so every Infra request is
 * automatically scoped to the chosen workspace. Personal = no active org.
 *
 * Unlike the dashboard `OrgSwitcher`, switching does NOT reload the page: the
 * canvas reacts to the active-org change and reloads in place.
 */
export function InfraContextSwitcher() {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { user } = useUser();
  const {
    userMemberships,
    setActive,
    isLoaded: listLoaded
  } = useOrganizationList({ userMemberships: { infinite: true } });
  const setContextSwitching = useInfraStore((s) => s.setContextSwitching);

  const [pendingId, setPendingId] = useState<string | null | undefined>(
    undefined
  );

  if (!orgLoaded || !listLoaded) {
    return (
      <div className='flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5'>
        <Skeleton className='size-6 rounded-md' />
        <div className='space-y-1'>
          <Skeleton className='h-2.5 w-24' />
          <Skeleton className='h-2 w-12' />
        </div>
      </div>
    );
  }

  const memberships = userMemberships?.data ?? [];
  const activeOrgId = organization?.id ?? null;
  const switching = pendingId !== undefined;

  const activeName = organization?.name ?? 'Personal workspace';
  const activeImage = organization?.imageUrl ?? user?.imageUrl ?? null;
  const activeKind = organization ? 'Organization' : 'Personal';

  const handleSelect = async (targetOrgId: string | null) => {
    if (!setActive || targetOrgId === activeOrgId) return;
    setPendingId(targetOrgId);
    setContextSwitching(true);
    try {
      await setActive({ organization: targetOrgId });
      // The canvas clears `contextSwitching` once it has reloaded the new
      // context (it keys its fetch on the active org id).
    } catch {
      setContextSwitching(false);
    } finally {
      setPendingId(undefined);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          disabled={switching}
          className={cn(
            'group flex h-9 max-w-[220px] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] pr-2 pl-1.5 text-left transition-colors',
            'hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-white/20 focus-visible:outline-none'
          )}
        >
          <Avatar className='size-6 rounded-md'>
            {activeImage ? (
              <AvatarImage src={activeImage} alt={activeName} />
            ) : null}
            <AvatarFallback className='bg-primary/15 text-primary rounded-md text-[10px] font-semibold'>
              {initials(activeName)}
            </AvatarFallback>
          </Avatar>
          <div className='min-w-0 flex-1 leading-tight'>
            <p className='text-foreground truncate text-xs font-semibold'>
              {activeName}
            </p>
            <p className='text-muted-foreground truncate text-[10px]'>
              {activeKind}
            </p>
          </div>
          {switching ? (
            <IconLoader2 className='text-muted-foreground size-3.5 shrink-0 animate-spin' />
          ) : (
            <IconChevronDown className='text-muted-foreground size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180' />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align='start' className='w-64'>
        <DropdownMenuLabel className='text-muted-foreground text-[11px] tracking-wide uppercase'>
          Switch workspace
        </DropdownMenuLabel>

        <ContextItem
          name='Personal workspace'
          kind='Personal'
          image={user?.imageUrl ?? null}
          icon={<IconUserBolt className='size-4' />}
          active={activeOrgId === null}
          pending={pendingId === null}
          onSelect={() => handleSelect(null)}
        />

        {memberships.length > 0 ? <DropdownMenuSeparator /> : null}

        {memberships.map((m) => (
          <ContextItem
            key={m.organization.id}
            name={m.organization.name}
            kind='Organization'
            image={m.organization.imageUrl ?? null}
            icon={<IconUsersGroup className='size-4' />}
            active={activeOrgId === m.organization.id}
            pending={pendingId === m.organization.id}
            onSelect={() => handleSelect(m.organization.id)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContextItem({
  name,
  kind,
  image,
  icon,
  active,
  pending,
  onSelect
}: {
  name: string;
  kind: 'Personal' | 'Organization';
  image: string | null;
  icon: React.ReactNode;
  active: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        onSelect();
      }}
      className='gap-2.5 py-2'
    >
      <Avatar className='size-7 rounded-md'>
        {image ? <AvatarImage src={image} alt={name} /> : null}
        <AvatarFallback className='bg-muted text-muted-foreground rounded-md'>
          {icon}
        </AvatarFallback>
      </Avatar>
      <div className='min-w-0 flex-1 leading-tight'>
        <p className='truncate text-sm font-medium'>{name}</p>
        <p className='text-muted-foreground text-[11px]'>{kind}</p>
      </div>
      {pending ? (
        <IconLoader2 className='text-muted-foreground size-4 animate-spin' />
      ) : active ? (
        <IconCheck className='text-primary size-4' />
      ) : null}
    </DropdownMenuItem>
  );
}
