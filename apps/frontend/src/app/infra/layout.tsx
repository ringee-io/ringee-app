import ClerkAppProvider from '@/components/layout/clerk-app-provider';
import { InfraShell } from '@/features/infra/components/infra-shell';

export const metadata = {
  title: 'Ringee Infra',
  robots: { index: false, follow: false }
};

export default function InfraLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkAppProvider>
      <InfraShell>{children}</InfraShell>
    </ClerkAppProvider>
  );
}
