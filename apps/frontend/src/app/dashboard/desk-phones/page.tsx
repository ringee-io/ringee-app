import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { RoleGuard } from '@ringee/frontend-shared/components/role-guard';
import { DeskPhonesView } from '@/features/desk-phones';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('calls.deskPhones');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function DeskPhonesPage() {
  const t = await getTranslations('calls.deskPhones');
  return (
    <PageContainer scrollable>
      <RoleGuard>
        <div className='flex flex-1 flex-col space-y-4'>
          <Heading title={t('title')} description={t('description')} />
          <Separator />
          <DeskPhonesView />
        </div>
      </RoleGuard>
    </PageContainer>
  );
}
