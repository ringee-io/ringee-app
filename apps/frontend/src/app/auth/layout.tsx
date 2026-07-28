import type { ReactNode } from 'react';
import ClerkAppProvider from '@/components/layout/clerk-app-provider';
import { CrispChat } from '@ringee/frontend-shared/components/crisp-chat';

// The sign-in/sign-up pages render Clerk's <SignIn>/<SignUp> widgets, so the
// auth group carries its own Clerk provider now that it no longer inherits one
// from the root layout.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkAppProvider>
      {children}
      <CrispChat />
    </ClerkAppProvider>
  );
}
