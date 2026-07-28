import ClerkAppProvider from '@/components/layout/clerk-app-provider';
import { InfraShell } from '@/features/infra/components/infra-shell';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { needsPhoneVerification } from '@/features/auth/lib/phone-access.server';

export const metadata = {
  title: 'Ringee Infra',
  robots: { index: false, follow: false }
};

export default async function InfraLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  if (user && (await needsPhoneVerification(user.phoneNumbers))) {
    redirect('/auth/sign-up/continue');
  }

  return (
    <ClerkAppProvider>
      <InfraShell>{children}</InfraShell>
    </ClerkAppProvider>
  );
}
