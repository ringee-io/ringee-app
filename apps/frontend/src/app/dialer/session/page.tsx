import type { Metadata } from 'next';
import { CallSessionWorkspace } from '@/features/dialer-session/components/call-session-workspace';

export const metadata: Metadata = {
  title: 'Ringee Call Session',
  description:
    'Open call session — dial contacts one by one and record outcomes.',
  robots: { index: false, follow: false }
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function DialerSessionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = params?.token?.trim() ?? '';
  return <CallSessionWorkspace token={token} />;
}
