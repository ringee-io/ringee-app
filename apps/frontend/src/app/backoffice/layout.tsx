import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { hasSuperAdminEmail } from '@/features/backoffice/lib/super-admins';
import { BackofficeShell } from '@/features/backoffice/components/backoffice-shell';

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
  const emails = user?.emailAddresses?.map((e) => e.emailAddress) ?? [];

  // Real enforcement is the backend SuperAdminGuard; this is the UX gate.
  if (!hasSuperAdminEmail(emails)) {
    redirect('/dashboard');
  }

  return <BackofficeShell>{children}</BackofficeShell>;
}
