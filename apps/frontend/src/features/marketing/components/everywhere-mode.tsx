'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Chrome, Globe, Smartphone } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';

import { AGENT_MARKS, MarkIcon } from './agent-marks';
import type { Mark } from './agent-marks';
import { COMPANY_LOGOS as LOGOS, CompanyLogo } from './company-logos';
import {
  BrowserChrome,
  ConnectorCard,
  Divider,
  Panel,
  StepRail,
  TagBadge,
  Wide,
  stepNumber,
  useFlowScroll
} from './flow-primitives';
import type { Connector, Sync } from './flow-primitives';
import { SIGN_UP_URL } from '../site';

/**
 * "The new era of dialing" — the full-bleed section before Agentic mode, and
 * the commercial argument the loop below assumes.
 *
 * The old dialer charged per seat, lived on one desktop, and made the rep type
 * up their own day. Ringee inverts all three: every screen a rep owns is a full
 * dialer, you pay $0.012 a minute instead of $30 a head, and the call writes
 * itself into the pipeline. That is the whole pitch, and the section is built
 * so a reader who never stops scrolling still gets it — four numbers under the
 * headline carry the argument alone, and everything below them is evidence.
 *
 * Copy discipline is the design here. The previous draft explained the product
 * and read as documentation; it sold nothing. So: one line per step, never two.
 * Sync notes under ten words. Nothing that the panel beside it already shows.
 * If a sentence is doing exposition rather than making a claim, it is cut.
 *
 * It borrows Agentic mode's shape on purpose — cards you set up once, then a
 * numbered run of steps, each drawn inside the surface it actually happens in,
 * each split between what the rep did and where it landed. Both sections are
 * built from the same atoms in `flow-primitives`, so the two read as one idea
 * told twice rather than two designs stacked.
 *
 * Every number quoted is real and on-site: $0.012/min pay-as-you-go, $20/month
 * flat for unlimited users, 180+ countries, free for one person. See `site.ts`
 * and `content/comparisons.ts`.
 */

/* ------------------------------------------------------------------ */
/* the three surfaces                                                  */
/* ------------------------------------------------------------------ */

/**
 * Lucide glyphs rather than vendor logos: these are Ringee's own surfaces, not
 * partners, and a row of App Store / Play / Chrome Web Store badges here would
 * read as a download strip instead of a claim about the product. Wrapped so
 * they satisfy `Mark` and pick up the tooltip every other mark on the page has.
 */
const WEB: Mark = {
  name: 'Web app',
  logo: (props) => <Globe {...props} />
};
const MOBILE: Mark = {
  name: 'iPhone & Android',
  logo: (props) => <Smartphone {...props} />
};
const EXTENSION: Mark = {
  name: 'Chrome extension',
  logo: (props) => <Chrome {...props} />
};

const SURFACE_MARKS = [WEB, MOBILE, EXTENSION];

/**
 * The headline numbers.
 *
 * Four facts and not one sentence — this is the part of the section a reader
 * who is scrolling actually takes in, so it has to carry the argument alone:
 * what a minute costs, what a team costs, how many places it runs, and what
 * hiring the next rep adds to the bill. Everything below it is evidence.
 */
const HEADLINE_STATS = [
  { value: '$0.012', unit: '/min', label: 'Pay-as-you-go, 180+ countries' },
  { value: '$20', unit: '/month', label: 'Flat. Whole team. Unlimited users.' },
  { value: '3', unit: 'surfaces', label: 'Web, phone, Chrome — one account' },
  { value: '$0', unit: 'per seat', label: 'Hiring never raises the bill' }
];

const SURFACES: Connector[] = [
  {
    label: 'Web app',
    line: 'The whole workspace. Campaigns, history, recordings, transcripts.',
    feeds: 'Covers 01 → 04',
    marks: [WEB],
    note: 'No install. No seat.'
  },
  {
    label: 'iPhone & Android',
    line: 'Dead time between meetings becomes dials.',
    feeds: 'Covers 02 · 03 · 04',
    marks: [MOBILE],
    note: 'App Store and Google Play.'
  },
  {
    label: 'Chrome extension',
    line: 'Every number you scroll past is a call button.',
    feeds: 'Covers 02 · 04',
    marks: [EXTENSION],
    note: 'One click. No tab switch.'
  }
];

/* ------------------------------------------------------------------ */
/* the run                                                             */
/* ------------------------------------------------------------------ */

/**
 * Each step draws the screen it actually happens on, and no two are built the
 * same way: a three-pane campaign workspace, a keypad bolted to somebody else's
 * page, a phone with disposition chips on it, and a fan-out diagram. That is
 * deliberate — the section below this one is a run of transcripts that all look
 * alike because they *are* alike (seven tool calls). These four are four
 * different products in one, so four different pictures.
 *
 * Only the outer frame is shared, and only so the page still reads as one page.
 */
type Surface =
  | { kind: 'campaign' }
  | { kind: 'dialer' }
  | { kind: 'outcome' }
  | { kind: 'fanout' };

type Step = {
  /** Rail label and panel heading — the thing the rep is doing. */
  name: string;
  /** Which surface it is drawn in. Shown as the badge beside the heading. */
  where: string;
  /** The step that is about all three at once, so the badge earns the accent. */
  everywhere?: boolean;
  /** One short line. Never two. */
  line: string;
  surface: Surface;
  /** Only where the mock does not already show where the work landed. */
  sync?: Sync;
};

type Phase = {
  label: string;
  /** One clause. What this phase is for. */
  note: string;
  steps: Step[];
};

const PHASES: Phase[] = [
  {
    label: 'Start the call',
    note: 'Zero dead air between dials',
    steps: [
      {
        name: 'Campaign dialer',
        where: 'Web app',
        line: 'Progressive or preview. One session runs the whole list.',
        surface: { kind: 'campaign' }
      },
      {
        name: 'Manual dialer',
        where: 'Web app',
        line: 'Dial anyone. Recording and live transcript run themselves.',
        surface: { kind: 'dialer' }
      }
    ]
  },
  {
    label: 'Close the loop',
    note: 'The call logs itself',
    steps: [
      {
        name: 'Log the outcome',
        where: 'Web, iOS & Android',
        line: 'One tap when you hang up, and the call is pipeline data.',
        surface: { kind: 'outcome' },
        sync: {
          label: 'Written to',
          logos: [LOGOS.attio, LOGOS.hubspot, LOGOS.salesforce, LOGOS.odoo],
          note: 'Nobody retypes their day at 6pm.'
        }
      }
    ]
  },
  {
    label: 'Everywhere at once',
    note: 'One account, one pipeline',
    steps: [
      {
        name: 'Everything in sync',
        where: 'All three',
        everywhere: true,
        line: 'Every dial, from every screen, into one pipeline.',
        surface: { kind: 'fanout' }
      }
    ]
  }
];

/* ------------------------------------------------------------------ */
/* shared bits of chrome                                               */
/* ------------------------------------------------------------------ */

/** Small caps label used inside a card to name a pane. */
function PaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className='text-muted-foreground/70 font-mono text-[10px] tracking-widest uppercase'>
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* the screenshots                                                     */
/* ------------------------------------------------------------------ */

/**
 * Real captures of the running product, from `/public/assets/web-screenshots`.
 *
 * They replaced a set of hand-drawn mocks, and the trade is worth naming: a
 * mock can be composed to say exactly what the line beside it says, but nobody
 * believes it. These are the actual screens, so the section stops describing
 * the product and starts showing it — which is the only thing on this page a
 * buyer treats as evidence.
 *
 * All three are dark captures. They keep their own background in both themes,
 * the way a product shot always does; the ring and the radius are what seat
 * them on a light page.
 */
type Shot = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

const SHOTS = {
  campaign: {
    src: '/assets/web-screenshots/dialer-campaign-log-outcome.png',
    width: 2514,
    height: 1502,
    alt: 'A Ringee campaign session: the lead and its previous attempts on the left, the call in the middle, and the disposition panel on the right.'
  },
  dialer: {
    src: '/assets/web-screenshots/manual-dialer.png',
    width: 2140,
    height: 1464,
    alt: 'A live Ringee call — connected timer, waveform, real-time transcription, and the contact call and meeting history beside it.'
  },
  outcome: {
    src: '/assets/web-screenshots/manual-dialer-log-outcome.png',
    width: 1014,
    height: 1252,
    alt: 'The Ringee disposition sheet: successful outcomes, the other dispositions, a quick note, and save.'
  }
} satisfies Record<string, Shot>;

function Screenshot({
  shot,
  sizes,
  className
}: {
  shot: Shot;
  sizes: string;
  className?: string;
}) {
  return (
    <Image
      src={shot.src}
      alt={shot.alt}
      width={shot.width}
      height={shot.height}
      sizes={sizes}
      className={cn(
        'block h-auto w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10',
        className
      )}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 01 · the campaign session                                           */
/* ------------------------------------------------------------------ */

/**
 * Full width and no column beside it: the capture is already three panes wide,
 * and squeezing it into 1.5fr would make the disposition list — the part that
 * proves the step — unreadable.
 */
function CampaignSurface() {
  return (
    <Panel
      chrome={<BrowserChrome url='app.ringee.io/campaigns/madrid-fintech' />}
    >
      <Screenshot
        shot={SHOTS.campaign}
        sizes='(min-width: 1024px) 1100px, 100vw'
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 02 · the manual dialer, mid-call                                    */
/* ------------------------------------------------------------------ */

/**
 * Also full width, because the thing worth seeing in this capture is the live
 * transcript running under the waveform, and at 1.5fr it is unreadable. What
 * would have been the column beside it becomes a strip underneath instead —
 * which is also what keeps this card from being the one above it again.
 */
function DialerSurface() {
  return (
    <Panel chrome={<BrowserChrome url='app.ringee.io/dialer' />}>
      <Screenshot
        shot={SHOTS.dialer}
        sizes='(min-width: 1024px) 1100px, 100vw'
      />

      <div className='border-border/60 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4'>
        <PaneLabel>Same dialer on</PaneLabel>
        <div className='flex items-center gap-3'>
          {[MOBILE, EXTENSION].map((mark) => (
            <MarkIcon key={mark.name} mark={mark} className='h-5 w-5' />
          ))}
        </div>
        <p className='text-muted-foreground text-sm'>
          180+ countries, $0.012 a minute, every surface.
        </p>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 03 · the disposition sheet                                          */
/* ------------------------------------------------------------------ */

/** What the sheet beside them costs the rep. */
const OUTCOME_STATS = [
  { value: '1 tap', label: 'Outcome, note and next touch' },
  { value: '0 min', label: 'Typing it up later' }
];

/**
 * The one portrait capture in the set, so it gets no browser chrome — it is a
 * sheet, not a page, and floating it against the panel is what makes this card
 * read differently from the two wide ones above it.
 */
function OutcomeSurface({ step }: { step: Step }) {
  return (
    <Panel sync={step.sync}>
      <div className='flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8'>
        <div className='w-full max-w-[340px] shrink-0'>
          <Screenshot
            shot={SHOTS.outcome}
            sizes='340px'
            className='shadow-xl shadow-black/20'
          />
        </div>

        {/* Same shape as the four numbers under the headline, so it rhymes. */}
        <dl className='flex w-full flex-row gap-6 sm:flex-col sm:gap-7'>
          {OUTCOME_STATS.map((stat) => (
            <div key={stat.label}>
              <dt className='text-foreground text-2xl font-bold tracking-tight lg:text-3xl'>
                {stat.value}
              </dt>
              <dd className='text-muted-foreground mt-1 text-sm text-pretty'>
                {stat.label}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 04 · the fan-out                                                    */
/* ------------------------------------------------------------------ */

/** What one finished call actually writes. */
const RECORD = [
  'call · 4m 12s',
  'recording + transcript',
  'outcome · interested',
  'callback · Thu 10:00'
];

/**
 * Not a screen — a diagram, because the last step is not a place. Three
 * surfaces converge on one account and the record fans back out to every CRM
 * and every agent. It is the only card in the section with no window on it,
 * which is what makes it read as the summary rather than a fifth product.
 */
function FanoutSurface() {
  return (
    <Panel>
      <div className='grid items-center gap-5 lg:grid-cols-[auto_auto_1fr_auto_auto] lg:gap-6'>
        {/* In: the three surfaces. */}
        <div data-row='1' className='flex flex-col gap-2'>
          <PaneLabel>Dialled from</PaneLabel>
          {SURFACE_MARKS.map((mark) => {
            const Logo = mark.logo;
            return (
              <span
                key={mark.name}
                className='border-border/60 bg-background/50 text-muted-foreground inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-[11px]'
              >
                <Logo className='h-3.5 w-3.5 shrink-0' />
                {mark.name}
              </span>
            );
          })}
        </div>

        <ArrowRight
          className='text-muted-foreground/40 hidden h-5 w-5 shrink-0 lg:block'
          aria-hidden
        />

        {/* The account: one record, written once. */}
        <div
          data-row='2'
          className='relative rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4'
        >
          <div className='flex items-center gap-2'>
            <span
              className='ringee-pulse h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500'
              aria-hidden
            />
            <p className='font-mono text-[11px] tracking-widest text-emerald-700 uppercase dark:text-emerald-400'>
              One Ringee account
            </p>
          </div>
          <ul className='mt-3 grid gap-1.5 sm:grid-cols-2'>
            {RECORD.map((field) => (
              <li
                key={field}
                className='text-muted-foreground border-border/50 bg-card rounded-md border px-2.5 py-1.5 font-mono text-[11px]'
              >
                {field}
              </li>
            ))}
          </ul>
          <p className='text-muted-foreground mt-3 text-xs'>
            Written once. No delay, no second version of the day.
          </p>
        </div>

        <ArrowRight
          className='text-muted-foreground/40 hidden h-5 w-5 shrink-0 lg:block'
          aria-hidden
        />

        {/* Out: the CRMs and the agents. */}
        <div data-row='3' className='flex flex-col gap-4'>
          <div>
            <PaneLabel>Into your CRM</PaneLabel>
            <div className='mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-3'>
              {[LOGOS.attio, LOGOS.hubspot, LOGOS.salesforce, LOGOS.odoo].map(
                (logo) => (
                  <CompanyLogo key={logo.alt} logo={logo} />
                )
              )}
            </div>
          </div>
          <div>
            <PaneLabel>And to your agent</PaneLabel>
            <div className='mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-3'>
              {AGENT_MARKS.map((mark) => (
                <MarkIcon key={mark.name} mark={mark} className='h-5 w-5' />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function StepCard({ step, index }: { step: Step; index: number }) {
  return (
    <div>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
        <span
          data-reveal='1'
          className='font-mono text-xs text-emerald-600 lg:hidden dark:text-emerald-400'
        >
          {stepNumber(index)}
        </span>
        <h3
          data-reveal='2'
          className='text-foreground text-xl font-semibold tracking-tight text-balance lg:text-2xl'
        >
          {step.name}
        </h3>
        <TagBadge label={step.where} accent={step.everywhere} />
      </div>
      <p
        data-reveal='3'
        className='text-muted-foreground mt-2 text-sm leading-relaxed text-pretty'
      >
        {step.line}
      </p>

      {step.surface.kind === 'campaign' ? (
        <CampaignSurface />
      ) : step.surface.kind === 'dialer' ? (
        <DialerSurface />
      ) : step.surface.kind === 'outcome' ? (
        <OutcomeSurface step={step} />
      ) : (
        <FanoutSurface />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* note                                                                */
/* ------------------------------------------------------------------ */

/** The four numbers under the headline. The section's argument, without prose. */
function HeadlineStats() {
  return (
    <dl className='border-border/70 bg-border/70 mt-12 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-4'>
      {HEADLINE_STATS.map((stat) => (
        <div key={stat.label} className='bg-card px-5 py-6 sm:px-6 sm:py-7'>
          <dt className='flex items-baseline gap-1.5'>
            <span className='text-foreground text-3xl font-bold tracking-tight lg:text-4xl'>
              {stat.value}
            </span>
            <span className='font-mono text-xs text-emerald-600 dark:text-emerald-400'>
              {stat.unit}
            </span>
          </dt>
          <dd className='text-muted-foreground mt-2.5 text-sm text-pretty'>
            {stat.label}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The counterpart to `RunsFrom`: not who drives Ringee, but where you open it. */
function WorksOn({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-3', className)}
    >
      <span className='text-muted-foreground font-mono text-[11px] tracking-widest uppercase'>
        Works on
      </span>
      <div className='flex items-center gap-4'>
        {SURFACE_MARKS.map((mark) => (
          <MarkIcon
            key={mark.name}
            mark={mark}
            className='h-5 w-5'
            wrapperClassName='text-muted-foreground/70 hover:text-foreground transition-colors duration-200'
          />
        ))}
      </div>
      <span className='text-muted-foreground text-xs'>
        + one account, no per-seat tax
      </span>
    </div>
  );
}

/**
 * The closing claim and the CTA. Rendered twice — pinned under the rail on
 * desktop, and once more after the last step on mobile, where a CTA between the
 * section header and the run would be asking for the sale before the argument.
 */
function EverywhereNote({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'border-border/60 flex flex-col items-start gap-4',
        className
      )}
    >
      <WorksOn />

      <p className='text-muted-foreground text-sm leading-relaxed text-pretty'>
        <span className='text-foreground font-semibold'>
          Old dialers charge per seat.
        </span>{' '}
        Ringee charges per minute — and runs on every screen your reps already
        own.
      </p>
      <Link
        href={SIGN_UP_URL}
        className='focus-visible:ring-offset-background inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-700/20 transition-all hover:bg-emerald-700/90 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98]'
      >
        Start calling free
        <ArrowRight className='h-4 w-4' aria-hidden />
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* section                                                             */
/* ------------------------------------------------------------------ */

export function EverywhereMode() {
  const { stepRefs, active, revealed, jumpTo } = useFlowScroll();

  // Running count across phases, so a step's number is its place in the run.
  let stepIndex = -1;

  return (
    <section
      id='every-screen'
      aria-label='Every screen is a dialer — Ringee on web, mobile and Chrome'
      className='relative w-full py-16 sm:py-24'
    >
      <Wide>
        <div className='max-w-3xl'>
          <p className='font-mono text-xs tracking-widest text-emerald-600 uppercase dark:text-emerald-400'>
            The new era of dialing
          </p>
          <h2 className='text-foreground mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl'>
            Every screen is a dialer. Every seat is free.
          </h2>
          <p className='text-muted-foreground mt-5 text-lg leading-relaxed text-pretty'>
            Web, phone, and the tab you are already in — all dialing the same
            account, all for $0.012 a minute.
          </p>
        </div>

        {/* The four numbers. For the reader who does not stop scrolling. */}
        <HeadlineStats />

        {/* Movement one: the surfaces. */}
        <div className='mt-12 sm:mt-14'>
          <Divider
            label='Open it anywhere'
            note='Three surfaces, zero extra seats'
          />
          <div className='mt-5 grid gap-4 md:grid-cols-3'>
            {SURFACES.map((surface, index) => (
              <ConnectorCard
                key={surface.label}
                connector={surface}
                index={index}
              />
            ))}
          </div>
        </div>

        {/* Movement two: the run, in three phases. */}
        <Divider
          label='Then just dial'
          note='Four steps, none of them admin'
          className='mt-16 sm:mt-20'
        />

        {/* Default `stretch` alignment is load-bearing: the left column has to
            fill the row for the sticky block inside it to have somewhere to
            travel as the panels scroll past. */}
        <div className='mt-8 flex flex-col gap-10 lg:flex-row lg:gap-12 xl:gap-16'>
          <div className='hidden lg:block lg:w-4/12 xl:w-3/12'>
            <div className='lg:sticky lg:top-24'>
              <StepRail phases={PHASES} active={active} onJump={jumpTo} />
              <EverywhereNote className='mt-8 hidden border-t pt-6 lg:flex' />
            </div>
          </div>

          <div className='flex flex-col lg:w-8/12 xl:w-9/12'>
            {PHASES.map((phase, phaseIndex) => (
              <div key={phase.label}>
                <Divider
                  label={phase.label}
                  note={phase.note}
                  className={phaseIndex === 0 ? undefined : 'mt-14 xl:mt-20'}
                />
                <div className='mt-8 flex flex-col gap-14 xl:gap-20'>
                  {phase.steps.map((step) => {
                    stepIndex += 1;
                    const index = stepIndex;
                    return (
                      <div
                        key={step.name}
                        ref={(node) => {
                          stepRefs.current[index] = node;
                        }}
                        className='ringee-scene'
                        data-active={index <= revealed}
                      >
                        <StepCard step={step} index={index} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <EverywhereNote className='mt-12 lg:hidden' />
      </Wide>
    </section>
  );
}
