import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Logo } from './logo';
import { NavMenu } from './nav-menu';
import { NavigationSheet } from './navigation-sheet';
import ThemeToggle from '../theme-toggle';
import { ArrowUpRight, Github } from 'lucide-react';
import Link from 'next/link';
import { ThemeSelector } from '@ringee/frontend-shared/components/theme-selector';

const Navbar = () => {
  return (
    <nav className='xs:h-16 mx-auto mt-5 h-14 max-w-screen backdrop-blur-sm'>
      {/* <div className='pointer-events-none absolute inset-x-0 top-0 h-[10px] animate-[pulse-glow_6s_ease-in-out_infinite] bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.35)_0%,_rgba(13,148,136,0.25)_35%,_rgba(6,182,212,0.2)_60%,_transparent_90%)] opacity-90 blur-2xl' /> */}

      <div className='pointer-events-none absolute inset-x-0 top-0 h-[10px] animate-[pulse-glow_6s_ease-in-out_infinite] bg-[linear-gradient(90deg,rgba(42,123,155,1)_0%,rgba(87,199,133,1)_50%,rgba(237,221,83,1)_100%)] opacity-90 blur-2xl' />

      <div className='mx-auto flex h-full items-center justify-between px-4 sm:px-6'>
        <Link href='/'>
          <Logo />
        </Link>

        {/* Desktop Menu */}
        <NavMenu className='hidden md:block' />

        <div className='flex items-center gap-3'>
          <ThemeToggle />

          <ThemeSelector />

          <Link href='https://github.com/ringee-co/ringee' target='_blank' rel='noreferrer noopener'>
            <Button
              variant='outline'
              size='icon'
              className='hidden cursor-pointer sm:inline-flex'
            >
              <Github className='h-4 w-4' />
              <span className='sr-only'>GitHub</span>
            </Button>
          </Link>

          <Link href='/auth/sign-in'>
            <Button
              variant='outline'
              className='hidden cursor-pointer sm:inline-flex'
            >
              Sign In
            </Button>
          </Link>

          <Link href='/auth/sign-up'>
            <Button className='hidden cursor-pointer sm:inline-flex'>
              Get Started
              <ArrowUpRight className='!h-5 !w-5' />
            </Button>
          </Link>

          {/* Mobile Menu */}
          <div className='md:hidden'>
            <NavigationSheet />
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
