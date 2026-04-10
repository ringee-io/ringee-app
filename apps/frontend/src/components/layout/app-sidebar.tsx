'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar
} from '@ringee/frontend-shared/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { UserAvatarProfile } from '@ringee/frontend-shared/components/user-avatar-profile';
import { navGroups } from '@ringee/frontend-shared/constants/data';
import type { NavItem } from '@ringee/frontend-shared/types';
import { useUser, useOrganization } from '@clerk/nextjs';
import {
  IconChevronsDown,
  IconLogout,
  IconPhoneCalling
} from '@tabler/icons-react';


import { SignOutButton } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { Icons } from '@ringee/frontend-shared/components/icons';
import { OrgSwitcher } from '@ringee/frontend-shared/components/org-switcher';
import { useDialerStore } from '@/features/calls/store/dialer.store';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { cn } from '@ringee/frontend-shared/lib/utils';

/** Groups that require an active organization session */
const ORG_ONLY_GROUPS = ['Outreach'];

function OutreachLockOverlay({ collapsed }: { collapsed: boolean }) {
  const api = useApi();
  const [loading, setLoading] = React.useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ url: string }>('/stripe/checkout/organization');
      if (res.url) window.location.href = res.url;
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  // When sidebar is collapsed to icon mode, suppress the text overlay
  if (collapsed) return null;

  return (
    <div className='absolute inset-0 z-10 flex flex-col items-center justify-center backdrop-blur-[0.5px]'>
      <p className='text-[11px] font-semibold text-foreground'>
        Available for organization level
      </p>
      <button
        onClick={handleUpgrade}
        disabled={loading}
        className='mt-0.5 text-xs text-emerald-500 hover:text-emerald-400 hover:underline transition-colors disabled:opacity-60'
      >
        {loading ? 'Redirecting...' : 'Upgrade now'}
      </button>
    </div>
  );
}

export default function AppSidebar({ useMock }: { useMock?: boolean }) {
  const pathname = usePathname();
  const dialer = useDialerStore();

  const { user } = useMock
    ? {
      user: {
        imageUrl: '/edison.jpg',
        fullName: 'Edison J. Padilla',
        emailAddresses: [{ emailAddress: 'edisonjpp@gmail.com' }]
      }
    }
    : useUser();

  const router = useRouter();

  const { canAccessAdminFeatures } = useMock
    ? { canAccessAdminFeatures: true }
    : useOrgRole();

  // Lock Outreach when there is no active organization session
  const { organization: activeOrg } = useMock
    ? { organization: { id: 'mock' } }
    : useOrganization();

  const hasActiveOrg = !!activeOrg;
  const { state: sidebarState } = useSidebar();
  const isCollapsed = sidebarState === 'collapsed';

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <OrgSwitcher useMock={useMock} />

        <SidebarMenuButton
          className='mt-4 cursor-pointer'
          onClick={() => dialer.setQuickDial(!dialer.quickDial)}
        >
          <IconPhoneCalling className='size-4' />
          <span>Open Quick call</span>
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent className='overflow-x-hidden'>
        {navGroups.map((group) => {
          const isOrgOnly = ORG_ONLY_GROUPS.includes(group.label);
          const isLocked = isOrgOnly && !hasActiveOrg;

          return (
            <SidebarGroup key={group.label} className='relative'>
              {/* When collapsed + locked: show tooltip on the group label icon */}
              {isLocked && isCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  </TooltipTrigger>
                  <TooltipContent side='right' className='text-xs'>
                    <p className='font-semibold'>Available for organization level</p>
                    <p className='text-[11px] text-muted-foreground mt-0.5'>Upgrade to unlock outreach tools.</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              )}

              {!useMock && isLocked && <OutreachLockOverlay collapsed={isCollapsed} />}

              <SidebarMenu
                className={isLocked ? 'pointer-events-none select-none blur-[0.5px] opacity-50' : ''}
              >
                {group.items.map((item: NavItem) => {
                  // @ts-ignore
                  const Icon = item.icon ? Icons[item.icon] : Icons.logo;

                  if (item.disabled) {
                    return (
                      <SidebarMenuItem key={item.title}>
                        <Tooltip>
                          {/* span wrapper needed — disabled button swallows pointer events */}
                          <TooltipTrigger asChild>
                            <span className='block w-full'>
                              <SidebarMenuButton
                                disabled
                                className='w-full cursor-default opacity-50'
                              >
                                {/* @ts-ignore */}
                                <Icon />
                                <span>{item.title}</span>
                                <span className='ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground'>
                                  Soon
                                </span>
                              </SidebarMenuButton>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side='right' className='max-w-52'>
                            <p className='font-semibold text-xs'>Inbox — coming soon 🚀</p>
                            <p className='mt-0.5 text-[11px] text-muted-foreground'>
                              Manage all your inbound messages, missed calls, and voicemails in one unified inbox.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </SidebarMenuItem>
                    );
                  }

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        isActive={pathname === item.url}
                      >
                        {/* @ts-ignore */}
                        <Link href={item.url}>
                          {/* @ts-ignore */}
                          <Icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size='lg'
                  className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
                >
                  {user && (
                    <UserAvatarProfile
                      className='h-8 w-8 rounded-lg'
                      showInfo
                      user={user}
                    />
                  )}
                  {/* @ts-ignore */}
                  <IconChevronsDown className='ml-auto size-4' />
                </SidebarMenuButton>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
                side='bottom'
                align='end'
                sideOffset={4}
              >
                <DropdownMenuLabel className='p-0 font-normal'>
                  <div className='px-1 py-1.5'>
                    {user && (
                      <UserAvatarProfile
                        className='h-8 w-8 rounded-lg'
                        showInfo
                        user={user}
                      />
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* Always visible */}
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
                    {/* @ts-ignore */}
                    <Icons.user className='mr-2 h-4 w-4' />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/dashboard/history')}>
                    {/* @ts-ignore */}
                    <Icons.history className='mr-2 h-4 w-4' />
                    History
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/dashboard/recordings')}>
                    {/* @ts-ignore */}
                    <Icons.mic className='mr-2 h-4 w-4' />
                    Recordings
                  </DropdownMenuItem>
                </DropdownMenuGroup>

                {/* Admin-only */}
                {canAccessAdminFeatures && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => router.push('/dashboard/rate')}>
                        {/* @ts-ignore */}
                        <Icons.star className='mr-2 h-4 w-4' />
                        Rate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push('/dashboard/buy-number')}>
                        {/* @ts-ignore */}
                        <Icons.phoneCall className='mr-2 h-4 w-4' />
                        Buy Number
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  {/* @ts-ignore */}
                  <IconLogout className='mr-2 h-4 w-4' />
                  <SignOutButton redirectUrl='/auth/sign-in' />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
