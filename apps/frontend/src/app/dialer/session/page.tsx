import type { Metadata } from 'next';
import { CallSessionWorkspace } from '@/features/dialer-session/components/call-session-workspace';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dialer.publicSession.page');
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false }
  };
}

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function DialerSessionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = params?.token?.trim() ?? '';
  return <CallSessionWorkspace token={token} />;
}
