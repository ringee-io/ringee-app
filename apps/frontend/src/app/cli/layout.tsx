import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import ClerkAppProvider from '@/components/layout/clerk-app-provider';
import { needsPhoneVerification } from '@/features/auth/lib/phone-access.server';

export const metadata = {
  robots: { index: false, follow: false }
};

/**
 * Pages a terminal sends the user to (`ringee login`). Signed-in only — the
 * middleware sends a signed-out visitor to sign-in and back here.
 */
export default async function CliLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  if (user && (await needsPhoneVerification(user.phoneNumbers))) {
    redirect('/auth/sign-up/continue');
  }

  return <ClerkAppProvider>{children}</ClerkAppProvider>;
}
