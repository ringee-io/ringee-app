'use client';
import { ClerkProvider } from '@clerk/nextjs';
import { ui } from '@clerk/ui';
import { dark } from '@clerk/ui/themes';
import { useTheme } from 'next-themes';
import React from 'react';

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
      {children}
    </ClerkProvider>
  );
}
