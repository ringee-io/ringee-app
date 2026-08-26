'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Github,
  Home,
  LifeBuoy,
  Puzzle,
  Tag
} from 'lucide-react';

import { Logo } from '@/features/landing/components/navbar/logo';
import { DOCS_URL, GITHUB_URL, SITE_NAME } from '@/features/marketing/site';

/**
 * Branded 404 for every unmatched route. Next.js renders this (inside the root
 * layout, not the marketing group), so it stays self-contained: own logo, a
 * clear "only this page is missing" message, and helpful links so visitors stay
 * on the site instead of bouncing. The inline style re-enables document
 * scrolling because the root layout pins `body { overflow: hidden }` for the
 * dashboard shell.
 */
const HELPFUL_LINKS = [
  {
    href: '/features',
    label: 'Features',
    description: 'Everything Ringee does',
    icon: Home
  },
  {
    href: '/pricing',
    label: 'Pricing',
    description: 'Plans and pay-as-you-go',
    icon: Tag
  },
  {
    href: '/integrations',
    label: 'Integrations',
    description: 'Connect your stack',
    icon: Puzzle
  },
  {
    href: '/support',
    label: 'Support',
    description: 'Get help fast',
    icon: LifeBuoy
  }
] as const;

export default function NotFound() {
  const router = useRouter();

  return (
    <>
      <style
        // The dashboard root layout sets `body { overflow: hidden }`. Re-enable
        // native scrolling here so the 404 is reachable on short viewports.
        dangerouslySetInnerHTML={{
          __html:
            'html{height:auto!important;overflow-y:auto!important}body{height:auto!important;overflow:visible!important}'
        }}
      />
      <main className='bg-background text-foreground relative flex min-h-dvh flex-col'>
        {/* Dotted texture + soft green glow, matching the marketing site. */}
        <div aria-hidden className='pointer-events-none absolute inset-0 z-0'>
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] [background-size:24px_24px] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)]' />
          <div className='absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(16,185,129,0.12),transparent_70%)]' />
        </div>

        <div className='relative z-10 flex min-h-dvh flex-col'>
          <header className='mx-auto flex h-16 w-full max-w-6xl items-center px-6 lg:px-8'>
            <Link
              href='/'
              aria-label={`${SITE_NAME} home`}
              className='shrink-0'
            >
              <Logo />
            </Link>
          </header>

          <div className='mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center'>
            <p className='text-sm font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400'>
              Error 404
            </p>
            <h1 className='mt-4 text-5xl font-bold tracking-tight text-balance sm:text-6xl'>
              This page is missing
            </h1>
            <p className='text-muted-foreground mt-5 max-w-md text-lg text-pretty'>
              The page you’re looking for doesn’t exist or has moved. The rest
              of {SITE_NAME} is working fine — here’s where to go next.
            </p>

            <div className='mt-9 flex flex-col items-center gap-3 sm:flex-row'>
              <Link
                href='/'
                className='inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-600/90 active:scale-[0.98]'
              >
                <Home className='h-4 w-4' aria-hidden />
                Back to home
              </Link>
              <button
                type='button'
                onClick={() => router.back()}
                className='border-border/80 hover:bg-muted/60 inline-flex h-12 items-center justify-center gap-2 rounded-xl border bg-transparent px-6 text-sm font-semibold transition-all active:scale-[0.98]'
              >
                <ArrowLeft className='h-4 w-4' aria-hidden />
                Go back
              </button>
            </div>

            <div className='mt-12 grid w-full grid-cols-1 gap-3 sm:grid-cols-2'>
              {HELPFUL_LINKS.map(({ href, label, description, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className='border-border/70 bg-card hover:border-foreground/30 group flex items-center gap-3 rounded-xl border p-4 text-left transition-colors'
                >
                  <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                    <Icon className='h-4 w-4' aria-hidden />
                  </span>
                  <span>
                    <span className='block text-sm font-semibold'>{label}</span>
                    <span className='text-muted-foreground block text-xs'>
                      {description}
                    </span>
                  </span>
                </Link>
              ))}
            </div>

            <p className='text-muted-foreground mt-10 text-sm'>
              Followed a broken link?{' '}
              <a
                href='mailto:hello@ringee.io?subject=Broken%20link%20on%20ringee.io'
                className='font-medium text-emerald-600 hover:underline dark:text-emerald-400'
              >
                Let us know
              </a>{' '}
              · Browse the{' '}
              <a
                href={DOCS_URL}
                target='_blank'
                rel='noreferrer noopener'
                className='inline-flex items-center gap-0.5 font-medium text-emerald-600 hover:underline dark:text-emerald-400'
              >
                docs <BookOpen className='h-3 w-3' aria-hidden />
              </a>{' '}
              or{' '}
              <a
                href={GITHUB_URL}
                target='_blank'
                rel='noreferrer noopener'
                className='inline-flex items-center gap-0.5 font-medium text-emerald-600 hover:underline dark:text-emerald-400'
              >
                GitHub <Github className='h-3 w-3' aria-hidden />
                <ArrowUpRight className='h-3 w-3' aria-hidden />
              </a>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
