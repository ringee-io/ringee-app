import KBar from '@ringee/frontend-shared/components/kbar';
import AppMainSidebar from '@/components/layout/app.main.sidebar';
import ClerkAppProvider from '@/components/layout/clerk-app-provider';
// import Header from '@/components/layout/header';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from '@ringee/frontend-shared/components/ui/sidebar';
import { DialerShortcutView } from '@/features/calls/components/dialer.shortcut.view';
import { VoiceAgentsRail } from '@/features/ai-voice-agents/automations/components/voice-agents-rail';
import { OnboardingGuideWrapper } from '@/features/onboarding/components/onboarding-guide-wrapper';
import { AccountLockdownProvider } from '@/features/security';
import { OfferBanner } from '@/features/offers';
import { CreditBalanceLoader } from '@/features/credit/components/credit-balance-loader';
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
            {/* min-w-0: the page shrinks beside the voice agents strip
                instead of pushing it off screen. */}
            <SidebarInset className='min-w-0'>
              {/* Above the header on purpose: an offer banner shifts the whole
                  dashboard down rather than competing with the toolbar. Renders
                  nothing when no offer applies. */}
              <OfferBanner placement='TOP_BANNER' />
              {/* <Header /> */}
              {/* What the header's trigger used to be on a phone: below `md`
                  the sidebar is a sheet off screen, with no rail to grab and
                  no other way to open it. 48px plus the content's `mt-1` keep
                  the 52px every page reserves (`100dvh-52px`). */}
              <div className='flex h-12 shrink-0 items-center px-2 md:hidden'>
                <SidebarTrigger className='size-9' />
              </div>
              {/* The balance's first load, which the header's credit popover
                  used to do. Renders nothing. */}
              <CreditBalanceLoader />
              <div className='mt-1 flex gap-4 md:mt-4'>
                <div className='w-full min-w-0'>{children}</div>
                <DialerShortcutView defaultOpen={defaultDialerOpen} />
              </div>
            </SidebarInset>
            {/* "Trigger AI Voice Agents": full height beside the header and the
                page. Renders nothing unless the workspace is in the
                automations pilot (AGENT-018). */}
            <VoiceAgentsRail />
            <OnboardingGuideWrapper />
            {/* <SupportButton /> */}
          </SidebarProvider>
        </KBar>
      </AccountLockdownProvider>
    </ClerkAppProvider>
  );
}
