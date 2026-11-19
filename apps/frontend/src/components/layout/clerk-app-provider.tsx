'use client';
import { ClerkProvider, useUser } from '@clerk/nextjs';
import { ui } from '@clerk/ui';
import { dark } from '@clerk/ui/themes';
import { useTheme } from 'next-themes';
import posthog from 'posthog-js';
import React, { useEffect, useRef } from 'react';

function PostHogIdentity() {
  const { isLoaded, user } = useUser();
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (
      !isLoaded ||
      !process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ||
      !process.env.NEXT_PUBLIC_POSTHOG_HOST
    ) {
      return;
    }

    if (!user) {
      if (identifiedUserId.current) {
        posthog.reset();
        identifiedUserId.current = null;
      }
      return;
    }

    if (identifiedUserId.current === user.id) return;

    if (identifiedUserId.current) {
      posthog.reset();
    }

    posthog.identify(user.id, {
      ...(user.primaryEmailAddress?.emailAddress && {
        email: user.primaryEmailAddress.emailAddress
      }),
      ...(user.fullName && { name: user.fullName })
    });
    identifiedUserId.current = user.id;
  }, [isLoaded, user]);

  return null;
}

/**
 * Client-side Clerk provider, scoped to the authenticated route groups
 * (dashboard, backoffice, auth). It is intentionally NOT mounted on the public
 * marketing tree or the magic-link call-session page: keeping Clerk's frontend
 * bundle and its `no-store` frontend-API request off those pages reduces their
 * JS payload and lets them qualify for the back/forward cache.
 *
 * `resolvedTheme` (from next-themes, provided in the root layout) drives Clerk's
 * dark/light appearance, matching the rest of the app.
 */
export default function ClerkAppProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();

  return (
    <ClerkProvider
      ui={ui}
      appearance={{
        theme: resolvedTheme === 'dark' ? dark : undefined
      }}
    >
      <PostHogIdentity />
      {children}
    </ClerkProvider>
  );
}
