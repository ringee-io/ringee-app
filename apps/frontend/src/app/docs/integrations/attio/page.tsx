import type { Metadata } from 'next';
import { AttioIntegrationDocs } from '@/features/integrations/components/attio-integration-docs';

export const metadata: Metadata = {
  title: 'Attio Integration — Call from your CRM',
  description:
    'Connect Ringee to Attio and start calls directly from Person and Company records. Call activity, recordings, and notes sync back automatically.',
  keywords: [
    'Ringee Attio integration',
    'Attio CRM calling',
    'CRM dialer',
    'call from Attio',
    'Attio phone integration',
    'CRM call logging',
    'Ringee CRM sync',
    'Attio record action',
    'sales calling CRM',
    'VoIP CRM integration',
  ],
  openGraph: {
    title: 'Attio Integration — Call from your CRM | Ringee',
    description:
      'Start calls from Attio records. Call activity, recordings, and notes sync back to the right contact automatically.',
    url: 'https://www.ringee.io/docs/integrations/attio',
    type: 'article',
    siteName: 'Ringee.io',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Ringee + Attio Integration',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Attio Integration — Call from your CRM | Ringee',
    description:
      'Start calls from Attio records. Call activity, recordings, and notes sync back automatically.',
    images: ['/og-image.png'],
  },
};

export default function AttioDocsPage() {
  return <AttioIntegrationDocs />;
}
