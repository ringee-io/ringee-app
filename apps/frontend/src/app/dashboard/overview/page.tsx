import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { Dashboard } from '@/features/dashboard/components/dashboard';
import type { DashboardLayoutResponse } from '@/features/dashboard/lib/types';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('dashboard');
  return {
    title: `${t('title')} — Ringee`,
    description: t('description')
  };
}

// Avoid caching — layout is per-user and time-sensitive metrics.
export const dynamic = 'force-dynamic';

export default async function DashboardOverviewPage() {
  const initialLayout =
    await apiServer.get<DashboardLayoutResponse>('/dashboard/layout');
  return <Dashboard initialLayout={initialLayout} />;
}
