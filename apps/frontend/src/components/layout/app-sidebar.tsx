'use client';

import { useTranslations } from 'next-intl';
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
const ORG_ONLY_GROUPS = [''];

/** Maps the English labels in the shared `navGroups` constant to translation keys. */
const GROUP_LABEL_KEYS: Record<string, string> = {
  General: 'groups.general',
  Communication: 'groups.communication',
  Outreach: 'groups.outreach',
  Settings: 'groups.settings'
};

const ITEM_TITLE_KEYS: Record<string, string> = {
  Dashboard: 'items.dashboard',
  Contacts: 'items.contacts',
  Activities: 'items.activities',
  Meetings: 'items.meetings',
  Call: 'items.call',
  Inbox: 'items.inbox',
  Campaigns: 'items.campaigns',
  Callbacks: 'items.callbacks',
  DNC: 'items.dnc',
  Overview: 'items.overview',
  Integrations: 'items.integrations'
};

function OutreachLockOverlay({ collapsed }: { collapsed: boolean }) {
  const api = useApi();
  const t = useTranslations('navigation.sidebar');
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
        {t('outreachLocked')}
      </p>
      <button
        onClick={handleUpgrade}
        disabled={loading}
        className='mt-0.5 text-xs text-emerald-500 hover:text-emerald-400 hover:underline transition-colors disabled:opacity-60'
      >
        {loading ? t('redirecting') : t('upgradeNow')}
      </button>
    </div>
  );
}

export default function AppSidebar({ useMock }: { useMock?: boolean }) {
  const pathname = usePathname();
  const dialer = useDialerStore();
  const tNav = useTranslations('navigation');
  const tCommon = useTranslations('common');

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
          <span>{tNav('sidebar.openQuickCall')}</span>
        </SidebarMenuButton>


        <SidebarMenuButton
          className='mt-4 cursor-pointer'
          onClick={() => router.push('/dashboard/ai')}
        >
          <IconPhoneCalling className='size-4' />
          <span>Ringee AI</span>
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent className='overflow-x-hidden'>
        {navGroups.map((group) => {
          const isOrgOnly = ORG_ONLY_GROUPS.includes(group.label);
          const isLocked = isOrgOnly && !hasActiveOrg;
          const groupKey = GROUP_LABEL_KEYS[group.label];
          const groupLabel = groupKey ? tNav(groupKey) : group.label;

          return (
            <SidebarGroup key={group.label} className='relative'>
              {/* When collapsed + locked: show tooltip on the group label icon */}
              {isLocked && isCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
                  </TooltipTrigger>
                  <TooltipContent side='right' className='text-xs'>
                    <p className='font-semibold'>{tNav('sidebar.outreachLocked')}</p>
                    <p className='text-[11px] text-muted-foreground mt-0.5'>{tNav('sidebar.outreachLockedDescription')}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
              )}

              {!useMock && isLocked && <OutreachLockOverlay collapsed={isCollapsed} />}

              <SidebarMenu
                className={isLocked ? 'pointer-events-none select-none blur-[0.5px] opacity-50' : ''}
              >
                {group.items.map((item: NavItem) => {
                  // @ts-ignore
                  const Icon = item.icon ? Icons[item.icon] : Icons.logo;
                  const itemKey = ITEM_TITLE_KEYS[item.title];
                  const itemTitle = itemKey ? tNav(itemKey) : item.title;

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
                                <span>{itemTitle}</span>
                                <span className='ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground'>
                                  {tCommon('comingSoon')}
                                </span>
                              </SidebarMenuButton>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side='right' className='max-w-52'>
                            <p className='font-semibold text-xs'>{tNav('inboxTooltip.title')}</p>
                            <p className='mt-0.5 text-[11px] text-muted-foreground'>
                              {tNav('inboxTooltip.description')}
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
                        tooltip={itemTitle}
                        isActive={pathname === item.url}
                      >
                        {/* @ts-ignore */}
                        <Link href={item.url}>
                          {/* @ts-ignore */}
                          <Icon />
                          <span>{itemTitle}</span>
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
                    {tNav('userMenu.profile')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/dashboard/history')}>
                    {/* @ts-ignore */}
                    <Icons.history className='mr-2 h-4 w-4' />
                    {tNav('userMenu.history')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/dashboard/recordings')}>
                    {/* @ts-ignore */}
                    <Icons.mic className='mr-2 h-4 w-4' />
                    {tNav('userMenu.recordings')}
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
                        {tNav('userMenu.rate')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push('/dashboard/buy-number')}>
                        {/* @ts-ignore */}
                        <Icons.phoneCall className='mr-2 h-4 w-4' />
                        {tNav('userMenu.buyNumber')}
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
