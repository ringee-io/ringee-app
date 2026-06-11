import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger
} from '@ringee/frontend-shared/components/ui/sheet';
import { Menu } from 'lucide-react';
import { Logo } from './logo';
import { NavMenu } from './nav-menu';
import Link from 'next/link';
import ThemeToggle from '../theme-toggle';
import { useTranslations } from 'next-intl';

export const NavigationSheet = () => {
  const t = useTranslations('marketing.nav');
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant='ghost' size='icon' className='rounded-full'>
          <Menu className='h-6 w-6' />
        </Button>
      </SheetTrigger>
      <SheetContent
        side='right'
        className='border-border/40 flex w-[300px] flex-col border-l p-6 pr-8 sm:w-[350px]'
      >
        <div className='border-border/40 flex items-center justify-between border-b pb-6'>
          <Logo />
          {/* ThemeToggle included for mobile user convenience */}
          <ThemeToggle />
        </div>

        <div className='flex-1 overflow-y-auto py-6'>
          <NavMenu orientation='vertical' className='w-full' />
        </div>

        <div className='border-border/40 mt-auto flex flex-col gap-3 border-t pt-6'>
          <Link href='/auth/sign-in' className='w-full'>
            <Button variant='outline' className='w-full'>
              {t('signIn')}
            </Button>
          </Link>
          <Link href='/auth/sign-up' className='w-full'>
            <Button className='w-full'>{t('getStarted')}</Button>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
};
