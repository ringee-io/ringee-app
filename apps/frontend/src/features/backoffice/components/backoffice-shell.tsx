'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger
} from '@ringee/frontend-shared/components/ui/sidebar';
import {
  IconArrowLeft,
  IconLayoutDashboard,
  IconShieldLock,
  IconUsers
} from '@tabler/icons-react';

const NAV = [
  {
    href: '/backoffice/dashboard',
    label: 'Dashboard',
    icon: IconLayoutDashboard
  },
  { href: '/backoffice/accounts', label: 'Accounts', icon: IconUsers }
];

export function BackofficeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <Sidebar collapsible='icon'>
        <SidebarHeader>
          <div className='flex items-center gap-2 px-2 py-1.5'>
            <IconShieldLock className='text-primary size-5' />
            <span className='font-semibold group-data-[collapsible=icon]:hidden'>
              Backoffice
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Super admin</SidebarGroupLabel>
            <SidebarMenu>
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip='Back to app'>
                <Link href='/dashboard'>
                  <IconArrowLeft />
                  <span>Back to app</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className='flex h-14 items-center gap-2 border-b px-4'>
          <SidebarTrigger />
          <span className='text-muted-foreground text-sm font-medium'>
            Ringee Backoffice
          </span>
        </header>
        <div className='p-4 md:p-6'>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
