import Link from 'next/link';
import { IconBrandGithub, IconBrandReddit, IconBrandX } from '@tabler/icons-react';

import { Container } from './primitives';
import { FOOTER_COLUMNS, GITHUB_URL, SITE_NAME } from '../site';

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className='border-border/40 mt-8 border-t'>
      <Container className='py-14'>
        <div className='grid grid-cols-2 gap-10 md:grid-cols-5'>
          <div className='col-span-2 md:col-span-1'>
            <Link
              href='/'
              className='text-lg font-bold tracking-tight'
              aria-label='Ringee home'
            >
              Ringee
            </Link>
            <p className='text-muted-foreground mt-3 max-w-xs text-sm text-pretty'>
              Affordable outbound calling software for SDR teams, recruiters,
              agencies, freelancers, and outbound operators.
            </p>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className='text-sm font-semibold'>{column.title}</h2>
              <ul className='mt-4 flex flex-col gap-2.5'>
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className='text-muted-foreground hover:text-foreground text-sm'
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className='border-border/40 mt-12 flex flex-col-reverse items-center justify-between gap-5 border-t pt-8 sm:flex-row'>
          <p className='text-muted-foreground text-sm'>
            &copy; {year} {SITE_NAME}. Affordable outbound calling for modern
            teams.
          </p>
          <div className='text-muted-foreground flex items-center gap-5'>
            <Link
              href={GITHUB_URL}
              target='_blank'
              rel='noreferrer noopener'
              aria-label='Ringee on GitHub'
              className='hover:text-foreground'
            >
              <IconBrandGithub className='h-5 w-5' />
            </Link>
            <Link
              href='https://x.com/ringeeio'
              target='_blank'
              rel='noreferrer noopener'
              aria-label='Ringee on X'
              className='hover:text-foreground'
            >
              <IconBrandX className='h-5 w-5' />
            </Link>
            <Link
              href='https://www.reddit.com/r/ringee/'
              target='_blank'
              rel='noreferrer noopener'
              aria-label='Ringee on Reddit'
              className='hover:text-foreground'
            >
              <IconBrandReddit className='h-5 w-5' />
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
