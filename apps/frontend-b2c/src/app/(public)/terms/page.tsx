import PageContainer from '@/components/layout/page-container';
import TermsPageView from '@/features/landing/components/terms.page.view';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | Ringee',
  description: 'Terms of Service for Ringee.'
};

export default function Page() {
  return (
    <PageContainer scrollable>
      <div className='w-full'>
        <TermsPageView />
      </div>
    </PageContainer>
  );
}
