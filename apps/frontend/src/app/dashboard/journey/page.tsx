import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { IconAlertTriangle } from '@tabler/icons-react';
import PageContainer from '@/components/layout/page-container';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { JourneyWorkspace } from '@/features/journey/components/journey-workspace';
import type { JourneyOverview } from '@/features/journey/types';

export const metadata = {
  title: 'Journey — Ringee',
  description:
    'Where your calling operation stands today, and the highest-leverage thing to do next.'
};

// Per-user and time-sensitive: never cached.
export const dynamic = 'force-dynamic';

export default async function JourneyPage() {
  const [{ orgId, orgRole }, data] = await Promise.all([
    auth(),
    apiServer
      .get<JourneyOverview>('/journey/overview')
      // This is the landing page after sign-in — a failed metrics call must not
      // leave the user staring at an error screen with no way forward.
      .catch(() => null)
  ]);

  // Freelancers (no organization) are unrestricted; inside an org only admins
  // can act on setup, billing and integration work.
  const canAccessAdminFeatures = !orgId || orgRole === 'org:admin';

  return (
    <PageContainer scrollable>
      <div className='flex min-w-0 flex-1 flex-col'>
        {data ? (
          <JourneyWorkspace
            data={data}
            canAccessAdminFeatures={canAccessAdminFeatures}
          />
        ) : (
          <JourneyUnavailable />
        )}
      </div>
    </PageContainer>
  );
}

function JourneyUnavailable() {
  return (
    <div className='bg-card/60 flex flex-col items-center gap-3 rounded-2xl border p-10 text-center'>
      <span className='flex size-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400'>
        <IconAlertTriangle className='size-5' />
      </span>
      <div>
        <p className='text-sm font-semibold'>
          We could not load your journey right now
        </p>
        <p className='text-muted-foreground mt-1 text-xs'>
          This is only the summary — your calls, contacts and campaigns are
          unaffected. Refresh in a moment, or jump straight into your work.
        </p>
      </div>
      <div className='mt-1 flex flex-wrap justify-center gap-2'>
        <Link
          href='/dashboard/call'
          className='bg-foreground text-background hover:bg-foreground/90 rounded-full px-4 py-2 text-xs font-medium transition-colors'
        >
          Open the dialer
        </Link>
        <Link
          href='/dashboard/overview'
          className='hover:border-foreground/20 rounded-full border px-4 py-2 text-xs font-medium transition-colors'
        >
          Go to analytics
        </Link>
      </div>
    </div>
  );
}
