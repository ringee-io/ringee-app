'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  ArrowRight,
  Bot,
  ChevronDown,
  type LucideIcon,
  Menu,
  Mic,
  Moon,
  PhoneOutgoing,
  RefreshCw,
  Sun,
  Waypoints,
  X
} from 'lucide-react';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';

import { Logo } from '@/features/landing/components/navbar/logo';
import { CTA, DOCS_URL, MAIN_NAV, PRODUCT_MENU } from '../site';

const GROUP_ICONS: Record<string, LucideIcon> = {
  Communicate: PhoneOutgoing,
  'Record & Learn': Mic,
  Automate: Bot,
  Sync: RefreshCw,
  Control: Waypoints
};

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === 'dark';
  return (
    <button
      type='button'
      aria-label='Toggle color theme'
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className='border-border/70 text-muted-foreground hover:text-foreground hover:border-foreground/30 hidden h-9 w-9 items-center justify-center rounded-lg border transition-colors sm:inline-flex'
    >
      {mounted && isDark ? (
        <Sun className='h-4 w-4' />
      ) : (
        <Moon className='h-4 w-4' />
      )}
    </button>
  );
}

function ProductMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div
      className='relative'
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type='button'
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          open
            ? 'text-foreground bg-accent/60'
            : 'text-foreground/80 hover:text-foreground hover:bg-accent/40'
        )}
      >
        Product
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* Anchored to the left edge of the trigger; clamps to the viewport. */}
      <div
        className={cn(
          'absolute top-full left-0 z-50 pt-2 transition-all duration-150',
          open
            ? 'visible translate-y-0 opacity-100'
            : 'invisible -translate-y-1 opacity-0'
        )}
      >
        <div className='border-border/70 bg-popover/95 w-[min(58rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md'>
          <div className='grid max-h-[calc(100dvh-6rem)] gap-x-8 gap-y-7 overflow-y-auto p-6 sm:grid-cols-2 lg:grid-cols-3'>
            {PRODUCT_MENU.map((group) => {
              const Icon = GROUP_ICONS[group.title] ?? PhoneOutgoing;
              return (
                <div key={group.title}>
                  <div className='border-border/50 flex items-center gap-2 border-b pb-2.5'>
                    <span className='flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                      <Icon className='h-4 w-4' />
                    </span>
                    <span className='text-foreground text-xs font-semibold tracking-wide uppercase'>
                      {group.title}
                    </span>
                  </div>
                  <ul className='mt-2 flex flex-col gap-0.5'>
                    {group.links.map((link) => (
                      <li key={`${group.title}-${link.label}`}>
                        <Link
                          href={link.href}
                          className='group/item hover:bg-accent/60 -mx-2 block rounded-lg px-2 py-1.5 transition-colors'
                        >
                          <span className='text-foreground flex items-center gap-1 text-sm font-medium'>
                            {link.label}
                            <ArrowRight className='h-3 w-3 -translate-x-1 text-emerald-600 opacity-0 transition-all group-hover/item:translate-x-0 group-hover/item:opacity-100 dark:text-emerald-400' />
                          </span>
                          {link.description ? (
                            <span className='text-muted-foreground mt-0.5 block text-xs leading-snug'>
                              {link.description}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <div className='border-border/60 bg-muted/40 flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3.5'>
            <p className='text-muted-foreground text-sm'>
              Everything outbound teams need — without per-seat pricing.
            </p>
            <div className='flex items-center gap-4 text-sm font-medium'>
              <Link
                href='/features'
                className='inline-flex items-center gap-1 text-emerald-600 hover:underline dark:text-emerald-400'
              >
                All features <ArrowRight className='h-3.5 w-3.5' />
              </Link>
              <Link
                href='/integrations'
                className='inline-flex items-center gap-1 text-emerald-600 hover:underline dark:text-emerald-400'
              >
                Integrations <ArrowRight className='h-3.5 w-3.5' />
              </Link>
              <Link
                href={DOCS_URL}
                target='_blank'
                rel='noreferrer noopener'
                className='inline-flex items-center gap-1 text-emerald-600 hover:underline dark:text-emerald-400'
              >
                Developer docs <ArrowRight className='h-3.5 w-3.5' />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) document.documentElement.style.overflow = 'hidden';
    else document.documentElement.style.overflow = '';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  return (
    <div className='md:hidden'>
      <button
        type='button'
        aria-label='Open menu'
        onClick={() => setOpen(true)}
        className='border-border/70 inline-flex h-9 w-9 items-center justify-center rounded-lg border'
      >
        <Menu className='h-5 w-5' />
      </button>

      {/* Rendered through a portal so `fixed` resolves against the viewport
          and not the navbar's backdrop-filter containing block. */}
      {open && mounted
        ? createPortal(
            <div className='bg-background fixed inset-0 z-[60] flex flex-col overflow-y-auto'>
              <div className='border-border/40 flex items-center justify-between border-b px-6 py-4'>
                <Link href='/' onClick={() => setOpen(false)}>
                  <Logo />
                </Link>
                <button
                  type='button'
                  aria-label='Close menu'
                  onClick={() => setOpen(false)}
                  className='border-border/70 inline-flex h-9 w-9 items-center justify-center rounded-lg border'
                >
                  <X className='h-5 w-5' />
                </button>
              </div>

              <div className='flex flex-col gap-6 px-6 py-6'>
                {PRODUCT_MENU.map((group) => {
                  const Icon = GROUP_ICONS[group.title] ?? PhoneOutgoing;
                  return (
                    <div key={group.title}>
                      <p className='text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase'>
                        <Icon className='h-4 w-4 text-emerald-600 dark:text-emerald-400' />
                        {group.title}
                      </p>
                      <ul className='border-border/50 mt-2 ml-2 flex flex-col gap-1.5 border-l pl-4'>
                        {group.links.map((link) => (
                          <li key={`${group.title}-${link.label}`}>
                            <Link
                              href={link.href}
                              onClick={() => setOpen(false)}
                              className='block py-0.5 text-base font-medium'
                            >
                              {link.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}

                <div className='border-border/50 flex flex-col gap-3 border-t pt-5'>
                  {MAIN_NAV.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className='text-base font-medium'
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>

                <div className='mt-2 flex flex-col gap-3'>
                  <Link href={CTA.login.href} onClick={() => setOpen(false)}>
                    <Button variant='outline' className='w-full'>
                      {CTA.login.label}
                    </Button>
                  </Link>
                  <Link href={CTA.primary.href} onClick={() => setOpen(false)}>
                    <Button className='w-full bg-emerald-600 text-white hover:bg-emerald-600/90'>
                      {CTA.primary.label}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function MarketingNavbar() {
  const pathname = usePathname();
  return (
    <header className='border-border/40 bg-background/80 sticky top-0 z-50 border-b backdrop-blur-md'>
      {/* Green accent line, echoing the original landing gradient. */}
      {/* <div
        aria-hidden
        className='pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent'
      /> */}
      <nav
        aria-label='Primary'
        className='mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 lg:px-8'
      >
        <div className='flex items-center gap-2'>
          <Link href='/' aria-label='Ringee home' className='shrink-0'>
            <Logo />
          </Link>
          <div className='ml-2 hidden items-center gap-0.5 md:flex'>
            <ProductMenu />
            {MAIN_NAV.map((link) => {
              const active =
                pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'text-foreground bg-accent/60'
                      : 'text-foreground/80 hover:text-foreground hover:bg-accent/40'
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className='flex items-center gap-2 sm:gap-3'>
          <ThemeToggle />
          <Link href={CTA.login.href} className='hidden sm:inline-flex'>
            <Button variant='ghost' className='font-medium'>
              {CTA.login.label}
            </Button>
          </Link>
          <Link href={CTA.primary.href} className='hidden sm:inline-flex'>
            <Button className='bg-emerald-600 text-white shadow-sm hover:bg-emerald-600/90'>
              {CTA.primary.label}
            </Button>
          </Link>
          <MobileMenu />
        </div>
      </nav>
    </header>
  );
}
