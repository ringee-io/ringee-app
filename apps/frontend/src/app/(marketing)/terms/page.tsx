import TermsPageView from '@/features/landing/components/terms.page.view';
import { Metadata } from 'next';

import { buildMetadata } from '@/features/marketing/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Terms of Service | Ringee',
  description:
    'The terms that govern your use of Ringee — the open source outbound calling platform for browser-based international calling, recording, and AI automation.',
  path: '/terms'
});

export default function Page() {
  return <TermsPageView />;
}
