import { Suspense } from 'react';
import PageContainer from '@/components/layout/page-container';
import { FollowUpReviewScreen } from '@/features/ai-voice-agents/automations/follow-up/follow-up-review';

export const metadata = {
  title: 'Automatic follow-up',
  description:
    'Review and activate the AI follow-up that books, confirms and reschedules your meetings.'
};

/**
 * The shared automatic follow-up review (Stage 4C). The parent layout keeps
 * the AI Voice Agents access gate; the API enforces it on every request.
 */
export default function FollowUpPage() {
  return (
    <PageContainer scrollable>
      <Suspense fallback={null}>
        <FollowUpReviewScreen />
      </Suspense>
    </PageContainer>
  );
}
