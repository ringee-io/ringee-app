import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import ClerkAppProvider from '@/components/layout/clerk-app-provider';
import { fetchIsSuperAdmin } from '@/features/backoffice/lib/super-admins';
import { BackofficeShell } from '@/features/backoffice/components/backoffice-shell';
import { needsPhoneVerification } from '@/features/auth/lib/phone-access.server';

export const metadata = {
  title: 'Backoffice — Ringee',
  robots: { index: false, follow: false }
};

export default async function BackofficeLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  if (user && (await needsPhoneVerification(user.phoneNumbers))) {
    redirect('/auth/sign-up/continue');
  }

  // Real enforcement is the backend SuperAdminGuard; this is the UX gate. The
  // answer comes from the API so there is a single allowlist.
  if (!(await fetchIsSuperAdmin())) {
    redirect('/dashboard');
  }

  return (
    <ClerkAppProvider>
      <BackofficeShell>{children}</BackofficeShell>
    </ClerkAppProvider>
  );
}
