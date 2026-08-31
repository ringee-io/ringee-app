import { Suspense } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { CallDetail } from '@/features/call-detail';

export const metadata = {
  title: 'Call detail — Ringee',
  description:
    'Everything one call produced: outcome, transcript, recording, cost and routing.'
};

/**
 * A call has its own URL so it can be linked to — from the history table, from
 * the agent that placed it, from a campaign, or pasted into a conversation
 * about what went wrong on it.
 */
export default async function CallDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PageContainer scrollable={true}>
      <div className='flex flex-1 flex-col'>
        <Suspense fallback={<Skeleton className='h-96 w-full rounded-xl' />}>
          <CallDetail callId={id} />
        </Suspense>
      </div>
    </PageContainer>
  );
}
