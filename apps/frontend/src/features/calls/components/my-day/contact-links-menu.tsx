'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Globe, Linkedin, MoreHorizontal } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useContactBrief } from '../../hooks/use.contact.brief';

/** "linkedin.com/in/maria" — the address without its scheme. */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/**
 * The server sends only http(s) links; the browser checks again before
 * putting one in an `href`.
 */
function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function LinkItem({
  href,
  icon,
  label
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <DropdownMenuItem asChild className='items-start py-1.5'>
      <a href={href} target='_blank' rel='noopener noreferrer'>
        <span className='mt-0.5'>{icon}</span>
        <span className='grid min-w-0 flex-1'>
          <span>{label}</span>
          <span className='text-muted-foreground truncate text-xs'>
            {shortUrl(href)}
          </span>
        </span>
        <ExternalLink className='mt-1 size-3' aria-hidden />
      </a>
    </DropdownMenuItem>
  );
}

/**
 * The three dots next to a person on the Call page: their LinkedIn, and under
 * their company's name, its LinkedIn and website. Loads who they are the
 * first time it opens; `children` add the row's own actions underneath.
 */
export function ContactLinksMenu({
  contactId,
  name,
  companyName,
  variant = 'ghost',
  className,
  children
}: {
  contactId: string | null;
  name: string;
  /** Shown until the contact's own company profile has loaded. */
  companyName?: string | null;
  /** `outline` next to a primary button; `ghost` in a row. */
  variant?: 'outline' | 'ghost';
  className?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations('calls.myDay.links');
  const [open, setOpen] = useState(false);
  const { brief, loading, failed } = useContactBrief(contactId, {
    enabled: open
  });

  const personLinkedin = safeHref(brief?.linkedinUrl);
  const companyLinkedin = safeHref(brief?.company?.linkedinUrl);
  const website = safeHref(brief?.company?.website);
  const company = brief?.company?.name ?? companyName ?? null;
  const hasLinks = Boolean(personLinkedin || companyLinkedin || website);

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size='icon'
          className={cn(
            'shrink-0',
            variant === 'ghost' && 'text-muted-foreground',
            className
          )}
          aria-label={t('trigger', { name })}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-80 max-w-[calc(100vw-2rem)]'
      >
        {contactId && loading ? (
          <div className='grid gap-2 p-2' aria-busy>
            <Skeleton className='h-3 w-24' />
            <Skeleton className='h-8 w-full' />
            <Skeleton className='h-8 w-full' />
          </div>
        ) : null}

        {contactId && !loading && failed ? (
          <p className='text-muted-foreground px-2 py-1.5 text-xs'>
            {t('failed')}
          </p>
        ) : null}

        {personLinkedin ? (
          <>
            <DropdownMenuLabel className='text-muted-foreground px-2 pt-1 pb-0.5 text-xs font-medium'>
              {name}
            </DropdownMenuLabel>
            <LinkItem
              href={personLinkedin}
              icon={<Linkedin />}
              label={t('linkedin')}
            />
          </>
        ) : null}

        {companyLinkedin || website ? (
          <>
            {personLinkedin ? <DropdownMenuSeparator /> : null}
            {company ? (
              <DropdownMenuLabel className='text-muted-foreground px-2 pt-1 pb-0.5 text-xs font-medium'>
                {company}
              </DropdownMenuLabel>
            ) : null}
            {companyLinkedin ? (
              <LinkItem
                href={companyLinkedin}
                icon={<Linkedin />}
                label={t('companyLinkedin')}
              />
            ) : null}
            {website ? (
              <LinkItem
                href={website}
                icon={<Globe />}
                label={t('companyWebsite')}
              />
            ) : null}
          </>
        ) : null}

        {contactId && brief && !hasLinks ? (
          <p className='text-muted-foreground px-2 py-1.5 text-xs'>
            {t('none', { name })}
          </p>
        ) : null}

        {children ? (
          <>
            {contactId ? <DropdownMenuSeparator /> : null}
            {children}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
