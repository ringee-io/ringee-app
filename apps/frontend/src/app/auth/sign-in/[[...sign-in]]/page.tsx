import { Metadata } from 'next';
import SignInViewPage from '@/features/auth/components/sign-in-view';

export const metadata: Metadata = {
  title: 'Sign In to Your Ringee Account — Secure Access',
  description:
    'Log in to your Ringee account to manage calls, contacts, and phone numbers. Access your dashboard and connect with anyone, anywhere — powered by Telnyx and Ringee WebRTC.',
  keywords: [
    'Ringee login',
    'sign in',
    'Ringee account access',
    'VoIP dashboard',
    'business calling',
    'call management',
    'Ringee.io'
  ],
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: 'Sign In — Ringee Dashboard',
    description:
      'Access your Ringee dashboard to make calls, manage contacts, and view your global calling activity.',
    url: 'https://ringee.io/sign-in',
    type: 'website',
    siteName: 'Ringee.io',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Sign In to Ringee — Global Calling Platform'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Log In to Ringee',
    description:
      'Sign in to your Ringee account and continue making calls to 180+ countries. Fast, secure, and built for professionals.',
    images: ['/og-image.png']
  }
};

export default async function Page() {
  return <SignInViewPage />;
}
