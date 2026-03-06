'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { Menu, Phone, X, DollarSign, ShoppingCart } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Logo } from '@/features/landing/components/navbar/logo';
import { ModeToggle } from '@/components/layout/ThemeToggle/theme-toggle';
import { CreditPopover } from '@/features/credit/components/credit.popover';
import { UserNav } from '@/components/layout/user-nav';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useDialerStore } from '@/features/calls/store/dialer.store';

const NAV_ITEMS_AUTH = [
  { href: '/call', label: 'Phone', icon: Phone },
  { href: '/contacts', label: 'Contacts' },
  { href: '/history', label: 'History' },
  { href: '/recordings', label: 'Recordings' },
  { href: '/buy-numbers', label: 'Buy Numbers' }
];

const NAV_ITEMS_PUBLIC = [
  { href: '/rate', label: 'Rates', icon: DollarSign },
  { href: '/buy-numbers', label: 'Buy Numbers', icon: ShoppingCart }
];

export function B2CHeader() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { setQuickDial, quickDial } = useDialerStore();

  const navItems = isSignedIn ? NAV_ITEMS_AUTH : NAV_ITEMS_PUBLIC;

  return (
    <header className='sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
        <div className='container flex h-16 items-center justify-between px-4 mx-auto max-w-7xl'>
          {/* Logo */}
          <Link href='/' className='flex items-center'>
            <Logo />
        </Link>

        {/* Desktop Navigation */}
        <nav className='hidden md:flex items-center gap-1'>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'px-3 py-2 text-sm font-medium rounded-md transition-colors',
                pathname === item.href
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right side actions */}
        <div className='flex items-center gap-2'>
          {isSignedIn ? (
            <Button className='hidden md:block' variant='ghost' size='icon' onClick={() => setQuickDial(!quickDial)}>
              <Phone className='h-8 w-8' />
              {/* Open Quick Dial */}
            </Button>
          ) : null}

          {isSignedIn ? (
            <>
              <div className='hidden sm:block'>
                <CreditPopover />
              </div>
              <UserNav />
            </>
          ) : (
            <div className='hidden sm:flex items-center gap-2'>
              <Link href='/sign-in'>
                <Button variant='ghost'>Sign In</Button>
              </Link>
              <Link href='/sign-up'>
                <Button>Get Started</Button>
              </Link>
            </div>
          )}

          <ModeToggle />

          {/* Mobile menu button */}
          <Button
            variant='ghost'
            size='icon'
            className='md:hidden'
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className='h-5 w-5' />
            ) : (
              <Menu className='h-5 w-5' />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className='md:hidden border-t bg-background'>
          <nav className='container px-4 py-4 flex flex-col gap-2'>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  pathname === item.href
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                {item.label}
              </Link>
            ))}

            {isSignedIn ? (
              <div className='pt-2 border-t mt-2'>
                <CreditPopover />
              </div>
            ) : (
              <div className='pt-2 border-t mt-2 flex flex-col gap-2'>
                <Link href='/sign-in' onClick={() => setMobileMenuOpen(false)}>
                  <Button variant='outline' className='w-full'>
                    Sign In
                  </Button>
                </Link>
                <Link href='/sign-up' onClick={() => setMobileMenuOpen(false)}>
                  <Button className='w-full'>Get Started</Button>
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
