import PageContainer from '@/components/layout/page-container';
import CallPageView from '@/features/calls/components/call.page.view';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('calls');
  return {
    title: t('metaTitle'),
    description: t('metaDescription')
  };
}

export default function Page() {
  return (
    <PageContainer scrollable={true}>
      <CallPageView />
    </PageContainer>
  );
}
