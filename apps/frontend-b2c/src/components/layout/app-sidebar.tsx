'use client';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@ringee/frontend-shared/components/ui/collapsible';
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail
} from '@ringee/frontend-shared/components/ui/sidebar';
import { UserAvatarProfile } from '@ringee/frontend-shared/components/user-avatar-profile';
import { navItems } from '@ringee/frontend-shared/constants/data';
import { useUser } from '@clerk/nextjs';
import {
  IconCalendar,
  IconChevronRight,
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@ringee/frontend-shared/components/ui/tooltip';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';


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
  const { canAccessAdminFeatures, hiddenForMember } = useMock
    ? { canAccessAdminFeatures: true, hiddenForMember: [] as string[] }
    : useOrgRole();

  // Filter nav items based on role
  const filteredNavItems = navItems.map((item) => {
    if (!item.items?.length) return item;
    return {
      ...item,
      items: item.items.filter(
        (subItem) => canAccessAdminFeatures || !hiddenForMember.includes(subItem.title)
      ),
    };
  });

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
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarMenu>
            {filteredNavItems.map((item) => {
              const Icon = item.icon ? Icons[item.icon] : Icons.logo;
              return item?.items && item?.items?.length > 0 ? (
                <Collapsible
                  key={item.title}
                  asChild
                  defaultOpen={item.isActive}
                  className='group/collapsible'
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={pathname === item.url}
                      >
                        {/* @ts-ignore */}
                        {item.icon && <Icon />}
                        <span>{item.title}</span>
                        {/* @ts-ignore */}
                        <IconChevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items?.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === subItem.url}
                            >
                              {/* @ts-ignore */}
                              <Link href={subItem.url}>
                                <span>{subItem.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ) : (
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
        <SidebarGroup>
          <SidebarGroupLabel>Free tools</SidebarGroupLabel>
          <SidebarMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className='cursor-pointer'
                  onClick={() =>
                    window.open('https://link.publica.do/ZBRPuu', '_blank')
                  }
                >
                  <IconCalendar className='size-4' />
                  <span>Free social scheduler</span>
                </SidebarMenuButton>
              </TooltipTrigger>

              <TooltipContent side='right' className='text-sm'>
                Schedule your posts free with Publica.do
              </TooltipContent>
            </Tooltip>
          </SidebarMenu>
        </SidebarGroup>
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

                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => router.push('/dashboard/profile')}
                  >
                    {/* @ts-ignore */}
                    <Icons.user className='mr-2 h-4 w-4' />
                    Profile
                  </DropdownMenuItem>
                  {canAccessAdminFeatures && (
                    <>
                      <DropdownMenuItem
                        onClick={() => router.push('/dashboard/rate')}
                      >
                        {/* @ts-ignore */}
                        <Icons.star className='mr-2 h-4 w-4' />
                        Rate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => router.push('/dashboard/buy-number')}
                      >
                        {/* @ts-ignore */}
                        <Icons.phoneCall className='mr-2 h-4 w-4' />
                        Buy Number
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem
                    onClick={() => router.push('/dashboard/history')}
                  >
                    {/* @ts-ignore */}
                    <Icons.history className='mr-2 h-4 w-4' />
                    History
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  {/* @ts-ignore */}
                  <IconLogout className='mr-2 h-4 w-4' />
                  <SignOutButton redirectUrl='/sign-in' />
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
