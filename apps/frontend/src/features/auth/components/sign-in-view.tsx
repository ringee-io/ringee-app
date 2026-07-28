import { SignIn as ClerkSignInForm } from '@clerk/nextjs';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import AuthPageShell from './auth-page-shell';

export default async function SignInViewPage() {
  const t = await getTranslations('auth');

  return (
    <AuthPageShell
      quote={t('testimonial.quote')}
      author={t('testimonial.author')}
      mobileLogoClassName='mb-10'
    >
      <ClerkSignInForm />

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
