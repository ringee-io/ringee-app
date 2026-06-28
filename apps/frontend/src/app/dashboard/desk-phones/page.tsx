import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { RoleGuard } from '@ringee/frontend-shared/components/role-guard';
import { DeskPhonesView } from '@/features/desk-phones';

export const metadata = {
  title: 'Desk Phones',
  description:
    'Connect a physical SIP phone or softphone to a Ringee number. Inbound rings the desk phone; the same number stays usable as an outbound caller ID everywhere.'
};

export default function DeskPhonesPage() {
  return (
    <PageContainer scrollable>
      <RoleGuard>
        <div className='flex flex-1 flex-col space-y-4'>
          <Heading
            title='Desk Phones'
            description='Use a Yealink, Grandstream, Cisco, Zoiper or any SIP phone with your Ringee number.'
          />
          <Separator />
          <DeskPhonesView />
        </div>
      </RoleGuard>
    </PageContainer>
  );
}
