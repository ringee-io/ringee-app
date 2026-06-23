'use client';
import React from 'react';
import { ActiveThemeProvider } from '@ringee/frontend-shared/components/active-theme';

// Root-level providers shared by every route, including the public marketing
// tree. Clerk is intentionally NOT mounted here — it lives in `ClerkAppProvider`
// and is wrapped only around the authenticated route groups (dashboard,
// backoffice, auth). That keeps Clerk's frontend bundle and its `no-store`
// frontend-API request off the marketing and public call-session pages, cutting
// their JS weight and letting them qualify for the back/forward cache.
export default function Providers({
  activeThemeValue,
  children
}: {
  activeThemeValue: string;
  children: React.ReactNode;
}) {
  return (
    <ActiveThemeProvider initialTheme={activeThemeValue}>
      {children}
    </ActiveThemeProvider>
  );
}
