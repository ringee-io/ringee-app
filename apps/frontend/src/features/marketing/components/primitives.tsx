import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';

/** Centered max-width wrapper used by every section. */
export function Container({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-6xl px-6 lg:px-8', className)}>
      {children}
    </div>
  );
}

/** A vertical-rhythm <section> wrapper. */
export function Section({
  children,
  className,
  id
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('py-16 sm:py-24', className)}>
      {children}
    </section>
  );
}

/** Small uppercase category label that sits above a heading. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className='text-sm font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400'>
      {children}
    </p>
  );
}

/**
 * Subtle dotted-grid background, echoing the original landing texture. Absolute
 * and non-interactive; place inside a `relative` parent.
 */
export function DotGrid({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 -z-10', className)}
    >
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.08)_1px,transparent_0)] [background-size:22px_22px] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)]' />
    </div>
  );
}

/** Section heading block: optional eyebrow, h2 title, and lead paragraph. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  as = 'h2'
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: 'center' | 'left';
  as?: 'h2' | 'h3';
}) {
  const Heading = as;
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Heading className='text-3xl font-bold tracking-tight text-balance sm:text-4xl'>
        {title}
      </Heading>
      {description ? (
        <p className='text-muted-foreground text-lg text-pretty'>
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** A bordered card surface. */
export function Card({
  children,
  className,
  id
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        'border-border/70 bg-card text-card-foreground rounded-2xl border p-6 shadow-sm',
        className
      )}
    >
      {children}
    </div>
  );
}

/** Bulleted list with check marks for benefit/feature lists. */
export function CheckList({
  items,
  className
}: {
  items: string[];
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-col gap-3', className)}>
      {items.map((item) => (
        <li key={item} className='flex items-start gap-3'>
          <Check
            className='mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400'
            aria-hidden
          />
          <span className='text-muted-foreground'>{item}</span>
        </li>
      ))}
    </ul>
  );
}

type ButtonLinkProps = {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  external?: boolean;
  className?: string;
  withArrow?: boolean;
};

/** Styled CTA link. Uses the app's neutral palette, theme-aware. */
export function ButtonLink({
  href,
  children,
  variant = 'primary',
  external,
  className,
  withArrow
}: ButtonLinkProps) {
  const base =
    'inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-[0.98]';
  const styles =
    variant === 'primary'
      ? 'bg-emerald-700 text-white shadow-lg shadow-emerald-700/20 hover:bg-emerald-700/90 hover:shadow-xl hover:shadow-emerald-700/30'
      : 'border border-border/80 bg-transparent hover:bg-muted/60';
  const externalProps = external
    ? { target: '_blank', rel: 'noreferrer noopener' }
    : {};
  return (
    <Link href={href} className={cn(base, styles, className)} {...externalProps}>
      {children}
      {withArrow ? <ArrowUpRight className='h-4 w-4' aria-hidden /> : null}
    </Link>
  );
}

/** The primary + secondary CTA pair used in heroes and CTA bands. */
export function CtaButtons({
  primaryHref = '/auth/sign-up',
  primaryLabel = 'Start calling for free',
  secondaryHref = '/pricing',
  secondaryLabel = 'View pricing',
  className
}: {
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:gap-4', className)}>
      <ButtonLink href={primaryHref} withArrow>
        {primaryLabel}
      </ButtonLink>
      <ButtonLink href={secondaryHref} variant='secondary'>
        {secondaryLabel}
      </ButtonLink>
    </div>
  );
}

/** A subtle, decorative product UI card (no fabricated metrics). */
export function UiPanel({
  title,
  children,
  className
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-border/70 bg-card overflow-hidden rounded-2xl border shadow-sm',
        className
      )}
    >
      <div className='border-border/60 bg-muted/40 flex items-center gap-2 border-b px-4 py-3'>
        <span className='h-2.5 w-2.5 rounded-full bg-red-400/70' />
        <span className='h-2.5 w-2.5 rounded-full bg-amber-400/70' />
        <span className='h-2.5 w-2.5 rounded-full bg-emerald-400/70' />
        <span className='text-muted-foreground ml-2 text-xs font-medium'>
          {title}
        </span>
      </div>
      <div className='p-5'>{children}</div>
    </div>
  );
}
