'use client';

import { OrganizationProfile } from '@clerk/nextjs';
import { useTheme } from 'next-themes';

/**
 * Team members and invitations.
 *
 * Deliberately Clerk's own `OrganizationProfile` rather than a hand-rolled
 * screen. Ringee does not own organization membership — it receives it through
 * the Clerk webhook (`/webhooks/clerk`) — so a bespoke invite form would be a
 * second writer to a record this app only reads. Reusing Clerk keeps invitation
 * state, role changes and revocation in exactly one place.
 *
 * The Journey's `invite_team` action links here.
 */
export function TeamSettingsView() {
  const { resolvedTheme } = useTheme();

  return (
    <div className='flex justify-center pb-8'>
      <OrganizationProfile
        routing='hash'
        appearance={{
          variables: {
            colorBackground: resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff'
          },
          elements: {
            // The page already provides the heading and the card chrome.
            rootBox: 'w-full',
            cardBox: 'w-full max-w-none shadow-none border border-border'
          }
        }}
      />
    </div>
  );
}
