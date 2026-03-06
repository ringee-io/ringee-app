import { ArrowUpRight, Forward } from 'lucide-react';
import { Button } from './ui/button';
import { AnimatedGridPattern } from './ui/animated-grid-pattern';
import { cn } from '@ringee/frontend-shared/lib/utils';
import Link from 'next/link';

export default function CTABanner() {
  return (
    <div className='px-6'>
      <div className='dark bg-background text-foreground relative mx-auto my-20 w-full max-w-screen-lg overflow-hidden rounded-lg px-6 py-10 md:px-14 md:py-16 dark:border'>
        <AnimatedGridPattern
          numSquares={30}
          maxOpacity={0.1}
          duration={3}
          className={cn(
            '[mask-image:radial-gradient(400px_circle_at_right,white,rgba(255,255,255,0.6),transparent)]',
            'inset-x-0 inset-y-[-30%] h-[200%] skew-y-12'
          )}
        />
        <AnimatedGridPattern
          numSquares={30}
          maxOpacity={0.1}
          duration={3}
          className={cn(
            '[mask-image:radial-gradient(400px_circle_at_top_left,white,rgba(255,255,255,0.6),transparent)]',
            'inset-x-0 inset-y-0 h-[200%] skew-y-12'
          )}
        />
        <div className='relative z-0 flex flex-col gap-3'>
          <h3 className='text-3xl font-semibold md:text-4xl'>
            Ready to Power Your Voice with Ringee.io?
          </h3>
          <p className='mt-2 text-base md:text-lg'>
            Start calling smarter — buy numbers, manage calls, and record
            conversations all in one platform.
          </p>
        </div>
        <div className='relative z-0 mt-14 flex flex-col gap-4 sm:flex-row'>
          <Link href='/auth/sign-up'>
            <Button size='lg'>
              Get Started <ArrowUpRight className='!h-5 !w-5' />
            </Button>
          </Link>
          <Link href='/auth/sign-in'>
            <Button size='lg' variant='outline'>
              Discover More <Forward className='!h-5 !w-5' />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
