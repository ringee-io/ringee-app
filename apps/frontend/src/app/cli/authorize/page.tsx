import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CliAuthorize } from '@/features/agent-access/components/cli-authorize';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.cliAuthorize');
  return { title: `${t('metaTitle')} — Ringee` };
}

export default async function CliAuthorizePage({
  searchParams
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { code } = await searchParams;
  const initialCode = typeof code === 'string' && code.trim() ? code : null;
  return <CliAuthorize initialCode={initialCode} />;
}
