import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@ringee/frontend-shared/components/ui/sheet';
import { Menu } from 'lucide-react';
import { Logo } from './logo';
import { NavMenu } from './nav-menu';
import Link from 'next/link';

export const NavigationSheet = () => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant='outline' size='icon' className='rounded-full'>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <Logo />
        <NavMenu orientation='vertical' className='mt-12' />

        <div className='mt-8 space-y-4'>
          <Link href='/sign-in'>
            <Button variant='outline' className='w-full sm:hidden'>
              Sign In
            </Button>
          </Link>
          <Link href='/sign-up'>
            <Button className='xs:hidden w-full'>Get Started</Button>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
};
