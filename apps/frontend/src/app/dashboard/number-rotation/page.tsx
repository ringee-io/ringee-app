import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { RoleGuard } from '@ringee/frontend-shared/components/role-guard';
import { NumberRotationView } from '@/features/number-rotation';

export const metadata = {
  title: 'Number Rotation',
  description:
    'Local presence dialing: rotate your own caller IDs to lift answer rate and protect each number.'
};

export default function NumberRotationPage() {
  return (
    <PageContainer scrollable>
      <RoleGuard>
        <div className='flex flex-1 flex-col space-y-4'>
          <Heading
            title='Number Rotation'
            description='Present a local, healthy caller ID on every call — only from numbers you own.'
          />
          <Separator />
          <NumberRotationView />
        </div>
      </RoleGuard>
    </PageContainer>
  );
}
