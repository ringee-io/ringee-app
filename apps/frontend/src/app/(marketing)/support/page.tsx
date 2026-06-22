import SupportPageView from '@/features/landing/components/support.page.view';
import { Metadata } from 'next';
import { DetailLayout } from '@/features/marketing/components/detail-layout';

export const metadata: Metadata = {
  title: 'Support | Ringee',
  description:
    'Get help with Ringee — the open source VoIP platform for global calling. Contact our team at hello@ringee.io for questions about the iOS app, calls, billing, or your account.',
  keywords: [
    'Ringee support',
    'Ringee help',
    'VoIP app support',
    'Ringee customer service',
    'Ringee iOS app help',
    'Ringee contact'
  ],
  alternates: {
    canonical: 'https://www.ringee.io/support'
  },
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: 'Ringee Support — We are here to help',
    description:
      'Reach the Ringee team for any question about the iOS app, your calls, billing, or your account. Email us at hello@ringee.io.',
    url: 'https://www.ringee.io/support',
    type: 'website',
    siteName: 'Ringee.io',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Ringee Support'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ringee Support',
    description:
      'Need help with Ringee? Contact us at hello@ringee.io — we usually reply within a few hours.',
    images: ['/og-image.png']
  }
};

export default function Page() {
  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Support', href: '/support' }
      ]}
    >
      <SupportPageView />
    </DetailLayout>
  );
}
