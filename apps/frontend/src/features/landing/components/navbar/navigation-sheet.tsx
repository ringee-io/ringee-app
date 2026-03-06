import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@ringee/frontend-shared/components/ui/sheet';
import { Menu } from 'lucide-react';
import { Logo } from './logo';
import { NavMenu } from './nav-menu';
import Link from 'next/link';
import ThemeToggle from '../theme-toggle';

export const NavigationSheet = () => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant='ghost' size='icon' className='rounded-full'>
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col w-[300px] sm:w-[350px] p-6 pr-8 border-l border-border/40">
        <div className="flex items-center justify-between pb-6 border-b border-border/40">
          <Logo />
          {/* ThemeToggle included for mobile user convenience */}
          <ThemeToggle />
        </div>
        
        <div className="flex-1 overflow-y-auto py-6">
          <NavMenu orientation='vertical' className='w-full' />
        </div>

        <div className='mt-auto flex flex-col gap-3 pt-6 border-t border-border/40'>
          <Link href='/auth/sign-in' className="w-full">
            <Button variant='outline' className='w-full'>
              Sign In
            </Button>
          </Link>
          <Link href='/auth/sign-up' className="w-full">
            <Button className='w-full'>Get Started</Button>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
};
