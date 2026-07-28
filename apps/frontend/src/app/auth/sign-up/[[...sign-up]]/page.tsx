import { currentUser } from '@clerk/nextjs/server';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import SignUpViewPage from '@/features/auth/components/sign-up-view';
import VerifyPhoneView from '@/features/auth/components/verify-phone-view';
import { needsPhoneVerification } from '@/features/auth/lib/phone-access.server';

type SignUpPageProps = {
  params: Promise<{ 'sign-up'?: string[] }>;
};

const signUpMetadata: Metadata = {
  title: 'Create your Ringee account | Ringee',
  description:
    'Create your Ringee account to make outbound calls, manage contacts, track outcomes, and collaborate with your team.',
  keywords: [
    'Ringee sign up',
    'create account',
    'register Ringee',
    'outbound calling software',
    'sales dialer'
  ],
  alternates: {
    canonical: '/auth/sign-up'
  },
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: 'Create your Ringee account',
    description:
      'Create your Ringee account and start managing outbound calls from your browser.',
    url: '/auth/sign-up',
    type: 'website',
    siteName: 'Ringee.io',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Create your Ringee account'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Create your Ringee account',
    description:
      'Create your Ringee account and start managing outbound calls from your browser.',
    images: ['/og-image.png']
  }
};

const continueMetadata: Metadata = {
  title: 'Verify your phone number | Ringee',
  description:
    'Add and verify your phone number to finish setting up your Ringee account.',
  alternates: {
    canonical: '/auth/sign-up/continue'
  },
  robots: {
    index: false,
    follow: false
  },
  openGraph: {
    title: 'Verify your phone number | Ringee',
    description:
      'Add and verify your phone number to finish setting up your Ringee account.',
    url: '/auth/sign-up/continue',
    type: 'website',
    siteName: 'Ringee.io'
  },
  twitter: {
    card: 'summary',
    title: 'Verify your phone number | Ringee',
    description:
      'Add and verify your phone number to finish setting up your Ringee account.'
  }
};

const completeSignUpMetadata: Metadata = {
  title: 'Complete your signup | Ringee',
  description: 'Complete the remaining steps to create your Ringee account.',
  robots: {
    index: false,
    follow: false
  }
};

export async function generateMetadata({
  params
}: SignUpPageProps): Promise<Metadata> {
  const segments = (await params)['sign-up'];

  if (segments?.[0] === 'continue') {
    return continueMetadata;
  }

  if (segments?.length) {
    return completeSignUpMetadata;
  }

  return signUpMetadata;
}

export default async function Page() {
  const user = await currentUser();

  if (user) {
    // This backend read also synchronizes the newly-created Clerk user into
    // Ringee's database when the user.created webhook has not arrived yet.
    if (await needsPhoneVerification(user.phoneNumbers)) {
      return <VerifyPhoneView />;
    }

    redirect('/dashboard/overview');
  }

  return <SignUpViewPage />;
}
