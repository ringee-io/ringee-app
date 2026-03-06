import { Metadata } from 'next';
import SignUpViewPage from '@/features/auth/components/sign-up-view';

export const metadata: Metadata = {
  title: 'Create Your Ringee Account — Start Calling Worldwide',
  description:
    'Sign up for Ringee and start making crystal-clear calls to 180+ countries. Create your free account today and join thousands of salespeople and businesses using Ringee to connect globally.',
  keywords: [
    'Ringee sign up',
    'create account',
    'register Ringee',
    'VoIP app',
    'call software',
    'international calling',
    'cold calling tool',
    'sales dialer'
  ],
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: 'Join Ringee — Make Calls to 180+ Countries',
    description:
      'Create your Ringee account and start calling from your browser or mobile. Built for sales teams and professionals worldwide.',
    url: 'https://ringee.io/sign-up',
    type: 'website',
    siteName: 'Ringee.io',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Join Ringee — Global Calling Made Simple'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Create Your Ringee Account',
    description:
      'Sign up to make and record calls to 180+ countries. The easiest way for salespeople and businesses to connect worldwide.',
    images: ['/og-image.png']
  }
};

export default async function Page() {
  return <SignUpViewPage />;
}
