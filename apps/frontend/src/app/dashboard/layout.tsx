import KBar from '@ringee/frontend-shared/components/kbar';
import AppMainSidebar from '@/components/layout/app.main.sidebar';
import Header from '@/components/layout/header';
import { SidebarInset, SidebarProvider } from '@ringee/frontend-shared/components/ui/sidebar';
import { DialerShortcutView } from '@/features/calls/components/dialer.shortcut.view';
import { OnboardingGuideWrapper } from '@/features/onboarding/components/onboarding-guide-wrapper';
import { cookies } from 'next/headers';

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true';
  const defaultDialerOpen =
    cookieStore.get('quick_dial_state')?.value === 'true';

  return (
    <KBar>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppMainSidebar />
        <SidebarInset>
          <Header />
          <div className='flex gap-4'>
            <div className='w-full'>{children}</div>
            <DialerShortcutView defaultOpen={defaultDialerOpen} />
          </div>
        </SidebarInset>
        <OnboardingGuideWrapper />
        {/* <SupportButton /> */}
      </SidebarProvider>
    </KBar>
  );
}

