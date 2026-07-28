import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/features/landing/components/navbar/logo';
import { cn } from '@ringee/frontend-shared/lib/utils';

export default function AuthPageShell({
  quote,
  author,
  children,
  contentClassName,
  mobileLogoClassName
}: {
  quote: string;
  author: string;
  children: ReactNode;
  contentClassName?: string;
  mobileLogoClassName?: string;
}) {
  return (
    <div className='relative h-dvh flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0'>
      <div className='bg-muted relative hidden h-full flex-col p-10 text-white lg:flex dark:border-r'>
        <div className='absolute inset-0 bg-zinc-900' />
        <div className='relative z-20 flex items-center text-lg font-medium'>
          <Link href='/'>
            <Logo useWhiteLogo />
          </Link>
        </div>
        <div className='relative z-20 mt-auto'>
          <blockquote className='space-y-2'>
            <p className='text-lg italic'>&ldquo;{quote}&rdquo;</p>
            <footer className='text-muted-foreground text-sm font-semibold'>
              {author}
            </footer>
          </blockquote>
        </div>
      </div>

      <div className='flex h-full overflow-y-auto p-4 lg:p-8'>
        <div
          className={cn(
            'm-auto flex w-full flex-col items-center justify-center space-y-6',
            contentClassName ?? 'max-w-md'
          )}
        >
          <Link
            href='/'
            className={cn('flex sm:hidden', mobileLogoClassName ?? 'mb-5')}
          >
            <Logo useWhiteLogo />
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
