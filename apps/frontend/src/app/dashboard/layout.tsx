import KBar from '@ringee/frontend-shared/components/kbar';
import AppMainSidebar from '@/components/layout/app.main.sidebar';
import ClerkAppProvider from '@/components/layout/clerk-app-provider';
import Header from '@/components/layout/header';
import {
  SidebarInset,
  SidebarProvider
} from '@ringee/frontend-shared/components/ui/sidebar';
import { DialerShortcutView } from '@/features/calls/components/dialer.shortcut.view';
import { OnboardingGuideWrapper } from '@/features/onboarding/components/onboarding-guide-wrapper';
import { cookies } from 'next/headers';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { needsPhoneVerification } from '@/features/auth/lib/phone-access.server';

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  if (user && (await needsPhoneVerification(user.phoneNumbers))) {
    redirect('/auth/sign-up/continue');
  }

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true';
  const defaultDialerOpen =
    cookieStore.get('quick_dial_state')?.value === 'true';

  return (
    <ClerkAppProvider>
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
    </ClerkAppProvider>
  );
}
