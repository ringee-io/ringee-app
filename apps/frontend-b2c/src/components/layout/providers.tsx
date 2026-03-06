'use client';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { useTheme } from 'next-themes';
import React from 'react';
import { ActiveThemeProvider } from '@ringee/frontend-shared/components/active-theme';
import { AuthenticatedProvider } from './authenticated-provider';

export default function Providers({
  activeThemeValue,
  children
}: {
  activeThemeValue: string;
  children: React.ReactNode;
}) {
  // we need the resolvedTheme value to set the baseTheme for clerk based on the dark or light theme
  const { resolvedTheme } = useTheme();

  return (
    <>
      <ActiveThemeProvider initialTheme={activeThemeValue}>
        <ClerkProvider
          signInFallbackRedirectUrl={process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL_B2C ?? '/'}
          signUpFallbackRedirectUrl={process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL_B2C ?? '/'}
          appearance={{
            baseTheme: resolvedTheme === 'dark' ? dark : undefined
          }}
        >
          <AuthenticatedProvider>
            {children}
          </AuthenticatedProvider>
        </ClerkProvider>
      </ActiveThemeProvider>
    </>
  );
}
