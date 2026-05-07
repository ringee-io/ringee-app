import PageContainer from '@/components/layout/page-container';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { SearchParams } from 'nuqs';
import CallPageView from '@/features/calls/components/call.page.view';
import { getTranslations } from 'next-intl/server';

type pageProps = {
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata() {
  const t = await getTranslations('calls');
  return {
    title: t('metaTitle'),
    description: t('metaDescription')
  };
}

export default async function Page(props: pageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <PageContainer scrollable={true}>
      <div className='scroll-y-auto flex flex-1 flex-col space-y-4'>
        <Separator />
        <CallPageView />
      </div>
    </PageContainer>
  );
}
