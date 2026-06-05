'use client';

/**
 * Faithful landing replicas of the Ringee ChatGPT App cards
 * (`apps/chatgpt-app/src/components/cards/*`). Those originals can't be imported
 * here — they live in a separate app and depend on the `window.openai` host
 * bridge plus `--success/--info/--warning` tokens absent from the frontend.
 * These mirror their exact layout/classes with sample data and our palette, so
 * the agentic chat shows what ChatGPT actually renders. Buttons are decorative.
 */

import * as React from 'react';
import {
  Phone,
  Mail,
  Building2,
  Tag,
  PhoneOutgoing,
  CalendarPlus,
  Link2,
  Copy,
  RefreshCw,
  Trash2,
  PhoneCall,
  ThumbsUp
} from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';

/* ----------------------------- card chrome ----------------------------- */

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'bg-card text-card-foreground overflow-hidden rounded-xl border shadow-sm',
        className
      )}
      {...props}
    />
  );
}
function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex items-start gap-3 p-4', className)} {...props} />
  );
}
function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />;
}
function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-t px-4 py-3',
        className
      )}
      {...props}
    />
  );
}

/* ------------------------------- atoms --------------------------------- */

function FieldRow({
  icon: Icon,
  label,
  children
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className='flex items-center gap-2.5 text-sm'>
      <Icon className='text-muted-foreground size-4 shrink-0' />
      <span className='text-muted-foreground w-16 shrink-0'>{label}</span>
      <span className='min-w-0 flex-1 truncate font-medium'>{children}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='min-w-0'>
      <div className='text-muted-foreground text-[11px] tracking-wide uppercase'>
        {label}
      </div>
      <div className='truncate text-sm font-medium'>{value}</div>
    </div>
  );
}

function Badge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        className
      )}
      {...props}
    />
  );
}

/** active → emerald, like the ChatGPT StatusPill mapped to our palette. */
function StatusPill({ label }: { label: string }) {
  return (
    <span className='inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 capitalize dark:text-emerald-400'>
      <span className='size-1.5 rounded-full bg-emerald-500' aria-hidden />
      {label}
    </span>
  );
}

/* ----------------------------- ContactCard ----------------------------- */

export function MockContactCard({ t }: { t: (k: string) => string }) {
  return (
    <Card className='w-full'>
      <CardHeader>
        <span className='flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold text-white'>
          AC
        </span>
        <div className='min-w-0 flex-1'>
          <h3 className='truncate text-base leading-tight font-semibold'>
            Ava Chen
          </h3>
          <p className='text-muted-foreground truncate text-sm'>
            Head of Growth · Northwind Labs
          </p>
        </div>
        <Badge className='border-border text-muted-foreground shrink-0'>
          {t('cards.lastCall')}
        </Badge>
      </CardHeader>

      <CardContent className='space-y-2.5'>
        <FieldRow icon={Phone} label={t('cards.phone')}>
          +1 (415) 555-0192
        </FieldRow>
        <FieldRow icon={Mail} label={t('cards.email')}>
          ava@northwind.co
        </FieldRow>
        <FieldRow icon={Building2} label={t('cards.company')}>
          Northwind Labs
        </FieldRow>

        <div className='flex flex-wrap items-center gap-1.5 pt-1'>
          <Tag className='text-muted-foreground size-3.5' />
          {['Webinar', 'Enterprise'].map((tg) => (
            <Badge
              key={tg}
              className='border-transparent bg-violet-500/12 text-violet-600 dark:text-violet-400'
            >
              {tg}
            </Badge>
          ))}
        </div>
      </CardContent>

      <CardFooter>
        <Button size='sm' variant='secondary' className='pointer-events-none'>
          <PhoneOutgoing /> {t('cards.queueCall')}
        </Button>
        <Button size='sm' variant='ghost' className='pointer-events-none'>
          <CalendarPlus /> {t('cards.meeting')}
        </Button>
      </CardFooter>
    </Card>
  );
}

/* --------------------------- CallSessionCard --------------------------- */

export function MockCallSessionCard({ t }: { t: (k: string) => string }) {
  return (
    <Card className='w-full'>
      <CardHeader className='items-center'>
        <div className='bg-secondary text-secondary-foreground flex size-10 items-center justify-center rounded-lg'>
          <PhoneCall className='size-5' />
        </div>
        <div className='min-w-0 flex-1'>
          <h3 className='truncate text-base leading-tight font-semibold'>
            {t('cards.sessionTitle')}
          </h3>
          <p className='text-muted-foreground text-xs'>{t('cards.expires')}</p>
        </div>
        <StatusPill label={t('cards.active')} />
      </CardHeader>

      <CardContent className='space-y-4'>
        <div>
          <div className='mb-1.5 flex items-center justify-between text-xs'>
            <span className='text-muted-foreground'>{t('cards.progress')}</span>
            <span className='font-medium tabular-nums'>1/1 · 100%</span>
          </div>
          <div className='bg-muted h-2 overflow-hidden rounded-full'>
            <div className='bg-primary h-full w-full rounded-full' />
          </div>
        </div>

        <div className='grid grid-cols-3 gap-3'>
          <Stat label={t('cards.queue')} value={1} />
          <Stat label={t('cards.done')} value={1} />
          <Stat label={t('cards.expiresShort')} value='Jun 12' />
        </div>

        <div className='space-y-1.5'>
          <div className='bg-muted/40 flex items-center gap-2 rounded-lg border p-2'>
            <Link2 className='text-muted-foreground size-4 shrink-0' />
            <span className='min-w-0 flex-1 truncate font-mono text-xs'>
              ringee.io/s/ax93kqz7
            </span>
            <Button
              size='sm'
              variant='secondary'
              className='pointer-events-none'
            >
              <Copy /> {t('cards.copy')}
            </Button>
          </div>
          <p className='text-muted-foreground text-[11px]'>
            {t('cards.shareOnce')}
          </p>
        </div>
      </CardContent>

      <CardFooter className='justify-between'>
        <Button size='sm' variant='ghost' className='pointer-events-none'>
          <RefreshCw /> {t('cards.refresh')}
        </Button>
        <Button size='sm' variant='destructive' className='pointer-events-none'>
          <Trash2 /> {t('cards.revoke')}
        </Button>
      </CardFooter>
    </Card>
  );
}

/* --------------------------- CallOutcomeCard --------------------------- */

export function MockCallOutcomeCard({ t }: { t: (k: string) => string }) {
  return (
    <Card className='w-full max-w-sm'>
      <div className='h-1 bg-sky-500' />
      <CardHeader className='items-center'>
        <div className='flex size-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400'>
          <ThumbsUp className='size-5' />
        </div>
        <div className='min-w-0 flex-1'>
          <p className='text-muted-foreground text-[11px] tracking-wide uppercase'>
            {t('cards.outcomeLogged')}
          </p>
          <h3 className='truncate text-base leading-tight font-semibold'>
            {t('cards.interested')}
          </h3>
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        <blockquote className='text-muted-foreground border-l-2 pl-3 text-sm'>
          {t('cards.outcomeNote')}
        </blockquote>
        <p className='text-muted-foreground font-mono text-[11px]'>
          call 8f2a41c9
        </p>
      </CardContent>
    </Card>
  );
}
