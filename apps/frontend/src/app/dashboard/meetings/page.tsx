import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { MeetingsList } from '@/features/meetings/components/meetings-list';

export const metadata = {
  title: 'Meetings — Booked from Cold Calls | Ringee',
  description:
    'View and manage all meetings booked during cold calls. Track upcoming meetings, review past bookings, and stay on top of your pipeline.'
};

export default function MeetingsPage() {
  return (
    <PageContainer scrollable={true}>
      <div className='flex flex-1 flex-col space-y-4'>
        <div className='flex items-start justify-between'>
          <Heading
            title='Meetings'
            description='All meetings booked from cold calls'
          />
        </div>
        <Separator />
        <MeetingsList />
      </div>
    </PageContainer>
  );
}
