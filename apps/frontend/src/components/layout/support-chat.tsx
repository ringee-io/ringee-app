'use client';

import { useUser } from '@clerk/nextjs';
import { CrispChat } from '@ringee/frontend-shared/components/crisp-chat';
import { getIntercomAppId, IntercomChat } from './intercom-chat';

/**
 * Live-chat widget for pages without Clerk (marketing). Intercom wins when
 * `NEXT_PUBLIC_INTERCOM_APP_ID` is configured; otherwise Crisp, which itself
 * renders nothing without `NEXT_PUBLIC_CRISP_WEBSITE_ID`. Only one launcher is
 * ever mounted.
 */
export function SupportChat() {
  return getIntercomAppId() ? <IntercomChat /> : <CrispChat />;
}

/**
 * Same as {@link SupportChat}, but identifies the signed-in Clerk user to
 * Intercom. Must be rendered inside a `ClerkProvider`. Boots anonymously while
 * Clerk loads, then identifies the user once it is available.
 */
export function ClerkSupportChat() {
  const { user, isLoaded } = useUser();

  if (!getIntercomAppId()) return <CrispChat />;

  return (
    <IntercomChat
      user={
        isLoaded && user
          ? {
              id: user.id,
              name: user.fullName,
              email: user.primaryEmailAddress?.emailAddress,
              createdAt: user.createdAt
            }
          : null
      }
    />
  );
}
