import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';

import { Container } from './primitives';

/**
 * "Attio keeps the record, Ringee makes it dialable" — the Attio section on the
 * home page, between Agentic mode and the savings calculator.
 *
 * It deliberately does *not* retell the loop. Agentic mode already walks the
 * seven steps at full width, and Attio is one of the four CRMs in it; repeating
 * that story here in the same shape read as a rerun. So this section drops to
 * one screen and makes the single argument the loop can't: what the round trip
 * does to a *record*. The panel is an Attio person as it looks after a call —
 * the fields Ringee wrote marked, and nothing else claimed.
 *
 * Static by design. No rail, no pinning, no scroll listener — the whole section
 * is server-rendered and ships no JavaScript, which is also what keeps it from
 * feeling like a second act of the section above it.
 */

/** What crosses the boundary, in each direction. The section's actual claim. */
const EXCHANGE = [
  {
    direction: 'Attio → Ringee',
    body: 'Lists, people and owners come across as a queue your rep can dial.'
  },
  {
    direction: 'Ringee → Attio',
    body: 'Call, duration, recording, transcript, outcome and the next step go back on the record.'
  }
];

type Field = {
  label: string;
  value: string;
  /** Fields Ringee wrote. Marked in the panel and counted in the legend. */
  fromRingee?: boolean;
};

const RECORD: Field[] = [
  { label: 'Company', value: 'Nubank' },
  { label: 'Title', value: 'VP Sales' },
  { label: 'Direct dial', value: '+34 6•• ••• •••', fromRingee: true },
  { label: 'Last call', value: 'Today · 4m 12s', fromRingee: true },
  { label: 'Recording', value: 'ringee.io/r/8fk2m', fromRingee: true },
  { label: 'Outcome', value: 'Interested', fromRingee: true },
  { label: 'Next step', value: 'Callback · Thu 10:00', fromRingee: true }
];

/** The Attio person, as it reads after the call. */
function RecordPanel() {
  return (
    <div className='border-border/70 bg-card overflow-hidden rounded-2xl border shadow-xl shadow-black/5 dark:shadow-black/30'>
      <div className='border-border/60 flex items-center gap-2.5 border-b px-4 py-3'>
        <Image
          src='/companies/attio.svg'
          alt='Attio'
          width={120}
          height={30}
          className='h-4 w-auto dark:invert'
        />
        <span className='text-muted-foreground font-mono text-xs'>
          people · Marta Ibáñez
        </span>
      </div>

      <dl className='divide-border/50 divide-y'>
        {RECORD.map((field) => (
          <div
            key={field.label}
            className='flex items-center justify-between gap-4 px-4 py-2.5'
          >
            <dt className='flex min-w-0 items-center gap-2'>
              <span
                aria-hidden
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  field.fromRingee ? 'bg-emerald-500' : 'bg-border'
                )}
              />
              <span className='text-muted-foreground truncate font-mono text-xs'>
                {field.label}
              </span>
            </dt>
            <dd
              className={cn(
                'shrink-0 font-mono text-xs',
                field.fromRingee
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-foreground'
              )}
            >
              {field.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className='border-border/60 flex items-center gap-2 border-t px-4 py-3'>
        <span
          aria-hidden
          className='h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500'
        />
        <p className='text-muted-foreground text-xs'>
          Written by Ringee, from the call. Nobody typed any of it.
        </p>
      </div>
    </div>
  );
}

export function AgenticCrmFlow() {
  return (
    <section
      aria-label='Attio and Ringee'
      className='relative w-full py-16 sm:py-20'
    >
      <Container className='grid items-center gap-12 lg:grid-cols-2 lg:gap-16'>
        <div>
          <div className='flex items-center gap-4'>
            <Image
              src='/companies/attio.svg'
              alt='Attio'
              width={120}
              height={30}
              className='h-6 w-auto dark:invert'
            />
            <span
              className='text-lg font-light text-emerald-600 dark:text-emerald-400'
              aria-hidden
            >
              ×
            </span>
            {/* The wordmark is baked into the PNG, so it takes two files rather
                than a filter — same pair the navbar logo uses. */}
            <Image
              src='/logos/black.logo.png'
              alt='Ringee'
              width={1991}
              height={501}
              sizes='132px'
              className='h-7 w-auto dark:hidden'
            />
            <Image
              src='/logos/white.logo.png'
              alt='Ringee'
              width={1991}
              height={501}
              sizes='132px'
              className='hidden h-7 w-auto dark:block'
            />
          </div>

          <h2 className='text-foreground mt-7 text-3xl font-bold tracking-tight text-balance lg:text-4xl'>
            Attio keeps the record.{' '}
            <span className='text-muted-foreground'>
              Ringee makes it dialable.
            </span>
          </h2>

          <p className='text-muted-foreground mt-5 text-base leading-relaxed text-pretty'>
            Both are agentic and both speak MCP, so one agent works either side
            of the line — and the record it hands you back is the one you
            already keep.
          </p>

          <dl className='mt-8 flex flex-col gap-3'>
            {EXCHANGE.map((item) => (
              <div
                key={item.direction}
                className='border-border/60 bg-background/60 flex flex-col gap-1 rounded-xl border px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4'
              >
                <dt className='shrink-0 font-mono text-[11px] tracking-widest whitespace-nowrap text-emerald-600 uppercase sm:w-36 dark:text-emerald-400'>
                  {item.direction}
                </dt>
                <dd className='text-muted-foreground text-sm leading-relaxed text-pretty'>
                  {item.body}
                </dd>
              </div>
            ))}
          </dl>

          <Link
            href='/integrations/attio'
            className='mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400'
          >
            See the Attio integration
            <ArrowRight className='h-4 w-4' aria-hidden />
          </Link>
        </div>

        <RecordPanel />
      </Container>
    </section>
  );
}
