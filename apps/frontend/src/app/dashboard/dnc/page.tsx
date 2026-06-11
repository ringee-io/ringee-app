import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { DNCList } from '@/features/dnc/components/dnc-list';

export const metadata = {
  title: 'Do Not Call List | Ringee',
  description: 'Manage your Do Not Call list to ensure compliance.'
};

export default function DNCPage() {
  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <Heading
          title='Do Not Call'
          description='Manage numbers that should never be dialed'
        />
        <Separator />
        <DNCList />
      </div>
    </PageContainer>
  );
}
