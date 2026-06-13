import PageContainer from '@/components/layout/page-container';
import { VerifyNumberScreen } from '@/features/number/components/verify.number.screen';
import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.numbers.verify');
  return {
    title: t('metaTitle'),
    description: t('metaDescription')
  };
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NumberVerificationPage(props: Props) {
  const params = await props.params;

  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col'>
        <VerifyNumberScreen numberId={params.id} />
      </div>
    </PageContainer>
  );
}
