import PageContainer from '@/components/layout/page-container';
import { MeetingsCalendar } from '@/features/meetings/components/calendar/meetings-calendar';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('meetings');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default function MeetingsPage() {
  return (
    <PageContainer scrollable={true}>
      <div className='flex min-w-0 flex-1 flex-col'>
        <MeetingsCalendar />
      </div>
    </PageContainer>
  );
}
