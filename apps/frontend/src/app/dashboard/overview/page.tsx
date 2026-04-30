import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { Dashboard } from '@/features/dashboard/components/dashboard';
import type { DashboardLayoutResponse } from '@/features/dashboard/lib/types';

export const metadata = {
  title: 'Dashboard — Ringee',
  description:
    'Outcome-focused calling performance dashboard: meetings booked, sales, interested leads, and the best hours to call.'
};

// Avoid caching — layout is per-user and time-sensitive metrics.
export const dynamic = 'force-dynamic';

export default async function DashboardOverviewPage() {
  const initialLayout = await apiServer.get<DashboardLayoutResponse>(
    '/dashboard/layout'
  );
  return <Dashboard initialLayout={initialLayout} />;
}
