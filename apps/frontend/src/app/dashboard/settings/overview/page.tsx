import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { SettingsOverviewView } from '@/features/settings/components/settings-overview-view';

export const metadata = {
  title: 'Settings · Overview | Ringee',
  description: 'Configura tu cuenta y personaliza tu guion de llamadas.'
};

export default function Page() {
  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <Heading
          title='Overview'
          description='Personaliza tu cuenta y tu guion de llamadas.'
        />
        <Separator />
        <SettingsOverviewView />
      </div>
    </PageContainer>
  );
}
