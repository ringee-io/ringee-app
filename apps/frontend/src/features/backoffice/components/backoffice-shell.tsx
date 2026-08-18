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
  SidebarTrigger,
  useSidebar
} from '@ringee/frontend-shared/components/ui/sidebar';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import {
  IconArrowLeft,
  IconGift,
  IconLayoutDashboard,
  IconShieldLock,
  IconSpeakerphone,
  IconUsers
} from '@tabler/icons-react';

const NAV = [
  {
    href: '/backoffice/dashboard',
    label: 'Dashboard',
    icon: IconLayoutDashboard
  },
  { href: '/backoffice/accounts', label: 'Accounts', icon: IconUsers },
  {
    href: '/backoffice/campaigns',
    label: 'Campaigns',
    icon: IconSpeakerphone
  },
  { href: '/backoffice/offers', label: 'Offers', icon: IconGift }
];

export function BackofficeShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <BackofficeShellContent>{children}</BackofficeShellContent>
    </SidebarProvider>
  );
}

function BackofficeShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const closeMobileNavigation = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <>
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
                      <Link href={item.href} onClick={closeMobileNavigation}>
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
                <Link href='/dashboard' onClick={closeMobileNavigation}>
                  <IconArrowLeft />
                  <span>Back to app</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className='min-w-0 overflow-hidden'>
        <header className='flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4'>
          <SidebarTrigger className='size-9 md:size-7' />
          <span className='text-muted-foreground truncate text-sm font-medium'>
            Ringee Backoffice
          </span>
        </header>
        {/* Body is overflow-hidden globally, so the scroll lives here (mirrors
            the dashboard's PageContainer). Height = viewport minus the 56px
            header; pb gives mobile breathing room above the browser chrome. */}
        <ScrollArea className='h-[calc(100dvh-56px)]'>
          <div className='p-3 pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:p-4 md:p-6'>
            {children}
          </div>
        </ScrollArea>
      </SidebarInset>
    </>
  );
}
