import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { ActivitiesList } from '@/features/activities/components/activities-list';

export const metadata = {
  title: 'Activities — Call Activity Log | Ringee',
  description:
    'View your general calls, filter by disposition and date, schedule meetings for completed calls, and track existing scheduled meetings.'
};

export default function ActivitiesPage() {
  return (
    <PageContainer scrollable={true}>
      <div className='flex flex-1 flex-col space-y-4'>
        <div className='flex items-start justify-between'>
          <Heading
            title='Activities'
            description='Your general call activity outside of campaigns'
          />
        </div>
        <Separator />
        <ActivitiesList />
      </div>
    </PageContainer>
  );
}
