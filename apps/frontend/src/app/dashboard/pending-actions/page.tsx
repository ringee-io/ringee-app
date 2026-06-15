import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { PendingActionsList } from '@/features/pending-actions/components/pending-actions-list';

export const metadata = {
  title: 'Pending Actions',
  description:
    'Your execution center — what to do next, grouped and prioritized.'
};

export default function PendingActionsPage() {
  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <Heading
          title='Pending Actions'
          description='What to do next. Actions are grouped, prioritized and decay automatically so the list stays useful.'
        />
        <Separator />
        <PendingActionsList />
      </div>
    </PageContainer>
  );
}
