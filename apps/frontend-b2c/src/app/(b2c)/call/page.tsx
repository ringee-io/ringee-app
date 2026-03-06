import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import { SearchParams } from 'nuqs';
import CallPageView from '@/features/calls/components/call.page.view';

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export const metadata = {
  title: 'Call — Make Calls Worldwide | Ringee',
  description:
    'Make crystal-clear calls to 180+ countries directly from your browser.'
};

export default async function CallPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <div className='flex flex-1 flex-col space-y-4'>
      <Separator />
      <CallPageView />
    </div>
  );
}
