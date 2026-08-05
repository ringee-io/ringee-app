import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { IconAlertTriangle } from '@tabler/icons-react';
import PageContainer from '@/components/layout/page-container';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { JourneyWorkspace } from '@/features/journey/components/journey-workspace';
import { JourneySkeleton } from '@/features/journey/components/journey-skeleton';
import type { JourneyOverview } from '@/features/journey/types';

export async function generateMetadata() {
  const t = await getTranslations('journey');
  return { title: `${t('title')} — Ringee`, description: t('subtitle') };
}

// Per-workspace and time-sensitive: never statically cached.
export const dynamic = 'force-dynamic';

export default async function JourneyPage() {
  return (
    <PageContainer scrollable>
      <div className='flex min-w-0 flex-1 flex-col'>
        <Suspense fallback={<JourneySkeleton />}>
          <JourneyContent />
        </Suspense>
      </div>
    </PageContainer>
  );
}

async function JourneyContent() {
  const { orgId, orgRole } = await auth();

  // The backend returns 403 to org members on every journey route; this
  // redirect only spares them a broken screen. Freelancers have no org and are
  // their own workspace admin.
  const isWorkspaceAdmin = !orgId || orgRole === 'org:admin';
  if (!isWorkspaceAdmin) redirect('/dashboard/overview');

  const data = await apiServer
    .get<JourneyOverview>('/journey/overview')
    // This can be the landing page after sign-in — a failed metrics call must
    // not leave the user staring at an error screen with no way forward.
    .catch(() => null);

  if (!data) return <JourneyUnavailable />;

  return <JourneyWorkspace initial={data} />;
}

async function JourneyUnavailable() {
  const t = await getTranslations('journey');

  return (
    <div className='bg-card/60 flex flex-col items-center gap-3 rounded-2xl border p-10 text-center'>
      <span
        aria-hidden='true'
        className='flex size-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-400'
      >
        <IconAlertTriangle className='size-5' />
      </span>
      <div>
        <p className='text-sm font-semibold'>{t('error.title')}</p>
        <p className='text-muted-foreground mt-1 max-w-md text-xs leading-relaxed'>
          {t('error.body')}
        </p>
      </div>
      <div className='mt-1 flex flex-wrap justify-center gap-2'>
        <Link
          href='/dashboard/call'
          className='bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-ring rounded-full px-4 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none'
        >
          {t('error.openDialer')}
        </Link>
        <Link
          href='/dashboard/overview'
          className='hover:border-foreground/20 focus-visible:ring-ring rounded-full border px-4 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none'
        >
          {t('error.openAnalytics')}
        </Link>
      </div>
    </div>
  );
}
