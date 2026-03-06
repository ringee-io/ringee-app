import PageContainer from '@/components/layout/page-container';
import PrivacyPageView from '@/features/landing/components/privacy.page.view';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Ringee',
  description:
    'Learn how Ringee collects, uses, and protects your personal information. We are committed to ensuring your privacy and data security across all our communication services.',
  keywords: [
    'Ringee privacy policy',
    'data protection',
    'user privacy',
    'VoIP app privacy',
    'GDPR compliance',
    'data security',
    'Ringee.io'
  ],
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: 'Privacy Policy — Ringee',
    description:
      'Read how Ringee ensures your data privacy and security while using our communication and calling services.',
    url: 'https://ringee.io/privacy',
    type: 'article',
    siteName: 'Ringee.io',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Ringee Privacy Policy'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ringee Privacy Policy',
    description:
      'Your privacy matters. Learn how Ringee collects, uses, and protects your personal information and call data.',
    images: ['/og-image.png']
  }
};

export default function Page() {
  return (
    <PageContainer scrollable>
      <div className='w-full'>
        <PrivacyPageView />
      </div>
    </PageContainer>
  );
}
