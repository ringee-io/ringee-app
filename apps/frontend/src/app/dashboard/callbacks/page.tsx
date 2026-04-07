import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { CallbackList } from '@/features/callbacks/components/callback-list';

export const metadata = {
  title: 'Callbacks | Ringee',
  description: 'View and manage scheduled callback tasks.'
};

export default function CallbacksPage() {
  return (
    <PageContainer scrollable>
      <div className="flex flex-1 flex-col space-y-4">
        <Heading
          title="Callbacks"
          description="View and manage scheduled callbacks from dialer sessions"
        />
        <Separator />
        <CallbackList />
      </div>
    </PageContainer>
  );
}
