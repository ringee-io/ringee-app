import { Logo } from '@/features/landing/components/navbar/logo';
import { SignIn as ClerkSignInForm } from '@clerk/nextjs';
import { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = {
  title: 'Authentication',
  description: 'Authentication forms built using the components.'
};

export default async function SignInViewPage() {
  const t = await getTranslations('auth');

  return (
    <div className='relative h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0'>
      <div className='bg-muted relative hidden h-full flex-col p-10 text-white lg:flex dark:border-r'>
        <div className='absolute inset-0 bg-zinc-900' />
        <div className='relative z-20 flex items-center text-lg font-medium'>
          <Link href='/'>
            <Logo useWhiteLogo />
          </Link>
        </div>
        <div className='relative z-20 mt-auto'>
          <blockquote className='space-y-2'>
            <p className='text-lg italic'>
              &ldquo;{t('testimonial.quote')}&rdquo;
            </p>
            <footer className='text-muted-foreground text-sm font-semibold'>
              {t('testimonial.author')}
            </footer>
          </blockquote>
        </div>
      </div>
      <div className='flex h-full items-center justify-center p-4 lg:p-8'>
        <div className='flex w-full max-w-md flex-col items-center justify-center space-y-6'>
          <Link href='/' className='mb-10 flex sm:hidden'>
            <Logo useWhiteLogo />
          </Link>

          <ClerkSignInForm
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
        </div>
      </div>
    </div>
  );
}
