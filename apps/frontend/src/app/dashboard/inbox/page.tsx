import PageContainer from '@/components/layout/page-container';
import { InboxView } from '@/features/inbox/components/inbox-view';

export const metadata = {
  title: 'Inbox | Ringee',
  description:
    'Conversational timeline of calls, voicemails, voicedrops and SMS for each contact.'
};

export default function InboxPage() {
  return (
    <PageContainer scrollable={false}>
      <div className='flex h-[calc(100dvh-52px-2rem)] min-h-0 w-full'>
        <InboxView />
      </div>
    </PageContainer>
  );
}
