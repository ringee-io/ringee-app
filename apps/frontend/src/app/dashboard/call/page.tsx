import PageContainer from '@/components/layout/page-container';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { SearchParams } from 'nuqs';
import CallPageView from '@/features/calls/components/call.page.view';

type pageProps = {
  searchParams: Promise<SearchParams>;
};

export const metadata = {
  title: 'Calls — Make and Receive Calls Worldwide | Ringee',
  description:
    'Place and receive crystal-clear calls to 180+ countries directly from your browser. Powered by Telnyx and Ringee WebRTC technology for sales teams and global communication.'
};

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
