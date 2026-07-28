import { SignUp as ClerkSignUpForm } from '@clerk/nextjs';
import { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import AuthPageShell from './auth-page-shell';

export const metadata: Metadata = {
  title: 'Authentication',
  description: 'Authentication forms built using the components.'
};

export default async function SignUpViewPage() {
  const t = await getTranslations('auth');
  return (
    <AuthPageShell
      quote={t('testimonial.quote')}
      author={t('testimonial.author')}
    >
      <ClerkSignUpForm
        forceRedirectUrl='/auth/sign-up/continue'
        initialValues={{
          emailAddress: ''
        }}
      />
      <p className='text-muted-foreground px-8 text-center text-sm'>
        {t.rich('legal.agreement', {
          terms: (chunks) => (
            <Link
              href='/terms'
              className='hover:text-primary underline underline-offset-4'
            >
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link
              href='/privacy'
              className='hover:text-primary underline underline-offset-4'
            >
              {chunks}
            </Link>
          )
        })}
      </p>
    </AuthPageShell>
  );
}
