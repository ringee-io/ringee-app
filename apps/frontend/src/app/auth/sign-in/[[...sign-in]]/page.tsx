import { Metadata } from 'next';
import SignInViewPage from '@/features/auth/components/sign-in-view';

export const metadata: Metadata = {
  title: 'Sign in to Ringee | Ringee',
  description:
    'Sign in to your Ringee account to manage calls, contacts, campaigns, and team activity.',
  alternates: {
    canonical: '/auth/sign-in'
  },
  robots: {
    index: false,
    follow: false
  },
  openGraph: {
    title: 'Sign in to Ringee',
    description:
      'Access your Ringee account to manage calls, contacts, campaigns, and team activity.',
    url: '/auth/sign-in',
    type: 'website',
    siteName: 'Ringee.io',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Sign in to Ringee'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sign in to Ringee',
    description:
      'Access your Ringee account to manage calls, contacts, campaigns, and team activity.',
    images: ['/og-image.png']
  }
};

export default async function Page() {
  return <SignInViewPage />;
}
