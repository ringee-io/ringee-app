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
import { AccountLockdownProvider } from '@/features/security';
import { OfferBanner } from '@/features/offers';
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
      {/* Single realtime socket for this device: hangs up and locks the UI the
          instant the backoffice bans the account. */}
      <AccountLockdownProvider>
        <KBar>
          <SidebarProvider defaultOpen={defaultOpen}>
            <AppMainSidebar />
            <SidebarInset>
              {/* Above the header on purpose: an offer banner shifts the whole
                  dashboard down rather than competing with the toolbar. Renders
                  nothing when no offer applies. */}
              <OfferBanner placement='TOP_BANNER' />
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
      </AccountLockdownProvider>
    </ClerkAppProvider>
  );
}
