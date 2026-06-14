import TermsPageView from '@/features/landing/components/terms.page.view';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | Ringee',
  description: 'Terms of Service for Ringee.',
  alternates: { canonical: 'https://www.ringee.io/terms' }
};

export default function Page() {
  return <TermsPageView />;
}
