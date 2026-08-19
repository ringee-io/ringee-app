'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';

import { Container } from './primitives';
import {
  ChatGptLogo,
  ClaudeLogo,
  HermesLogo,
  OpenClawLogo
} from './agent-logos';
import { PRICING, REQUEST_DEMO_URL } from '../site';

/**
 * "Attio keeps the record, Ringee makes it dialable" — the pitch on the home
 * page, between the customer logos and the savings calculator.
 *
 * The argument it makes: Attio and Ringee are both agentic, so the same agent
 * that keeps the CRM can also run the calling. Ringee reaches it three ways —
 * the MCP server, the CLI, and the Claude Code plugin — and the panels below
 * alternate between a chat surface and a terminal so both are visible.
 *
 * The section is deliberately short on prose. The left column states the thesis
 * once and then hands over to a step rail — four verb phrases that spell out the
 * loop at a glance — while the right column *shows* each step as a transcript
 * instead of describing it. Anything the panel already demonstrates is not also
 * written out above it.
 *
 * Layout: from `md` up the left column is sticky and the four transcripts scroll
 * past it as one continuous list. Nothing is ever hidden or swapped out — every
 * panel stays on the page once you've reached it, and the only thing that moves
 * with the scroll is the marker on the rail. Each panel eases in the first time
 * it comes into view and then stays put. Below `md` it is a plain stacked list.
 *
 * The section paints no background of its own, so the layout's dot texture and
 * the reader's chosen theme both carry through — it reads as part of the page
 * rather than a band dropped on top of it.
 *
 * The positioning is deliberate: Ringee never places the call. The agent finds,
 * files, queues and writes up; a person dials.
 */

/* ------------------------------------------------------------------ */
/* agents                                                              */
/* ------------------------------------------------------------------ */

const AGENTS = [
  { name: 'ChatGPT', logo: ChatGptLogo },
  { name: 'Claude', logo: ClaudeLogo },
  { name: 'OpenClaw', logo: OpenClawLogo },
  { name: 'Hermes', logo: HermesLogo }
];

/* ------------------------------------------------------------------ */
/* scenes                                                              */
/* ------------------------------------------------------------------ */

/**
 * A partner mark from /public/companies. These ship at wildly different aspect
 * ratios — Attio and HubSpot are wide wordmarks, Apollo and Prospeo are squares
 * — so a single CSS height would leave the squares as specks next to them. Each
 * carries its own optical height and width cap instead.
 */
type Logo = {
  src: string;
  alt: string;
  height: number;
  maxWidth: number;
  /** Single-colour marks that would vanish on a dark background. */
  invertOnDark?: boolean;
};

const LOGOS = {
  attio: {
    src: '/companies/attio.svg',
    alt: 'Attio',
    height: 20,
    maxWidth: 82,
    invertOnDark: true
  },
  hubspot: {
    src: '/companies/hubspot.svg',
    alt: 'HubSpot',
    height: 17,
    maxWidth: 90
  },
  salesforce: {
    src: '/companies/salesforce.svg',
    alt: 'Salesforce',
    height: 24,
    maxWidth: 40
  },
  odoo: { src: '/companies/odoo.svg', alt: 'Odoo', height: 24, maxWidth: 30 },
  apollo: {
    src: '/companies/apollo.png',
    alt: 'Apollo',
    height: 22,
    maxWidth: 22
  },
  prospeo: {
    src: '/companies/prospeo.svg',
    alt: 'Prospeo',
    height: 22,
    maxWidth: 22
  }
} satisfies Record<string, Logo>;

type Row = { label: string; value: string; accent?: boolean };

type Scene = {
  /** Verb phrase for the step rail — also the kicker on stacked mobile. */
  step: string;
  title: string;
  /** One line. If the panel already shows it, it does not belong here. */
  body: string;
  /** Where this step runs: a chat surface or a terminal. */
  surface: { label: string; kind: 'chat' | 'cli' };
  prompt: string;
  tool: string;
  rows: Row[];
  /** Labelled partner strip in the panel footer. Omitted where none applies. */
  logos?: { label: string; items: Logo[] };
};

const SCENES: Scene[] = [
  {
    step: 'Find the segment',
    title: 'Ask for the segment, not for a list',
    body: 'Apollo and Prospeo, searched in place. You only reveal the ones you keep.',
    surface: { label: 'chatgpt · ringee mcp', kind: 'chat' },
    prompt: 'Find VP Sales at Series A fintechs in Madrid. Reveal the top 25.',
    tool: 'ringee · search_leads',
    rows: [
      { label: 'Marta Ibáñez · VP Sales', value: '+34 revealed', accent: true },
      {
        label: 'Diego Ferrán · Head of Sales',
        value: '+34 revealed',
        accent: true
      },
      { label: '+ 23 more matches', value: 'no Ringee credits' }
    ],
    logos: { label: 'Sourced from', items: [LOGOS.apollo, LOGOS.prospeo] }
  },
  {
    step: 'File it into Attio',
    title: 'Everything lands in Attio',
    body: 'Imported, deduped, tagged. Attio stays the source of truth — every row becomes dialable.',
    surface: { label: 'claude code · ringee cli', kind: 'cli' },
    prompt: 'claude "/ringee import the fintech list and push it to Attio"',
    tool: 'ringee · import_leads_as_contacts',
    rows: [
      { label: '25 leads → contacts', value: 'done', accent: true },
      { label: '3 duplicates merged', value: 'skipped' },
      { label: 'Attio workspace', value: 'in sync', accent: true }
    ],
    logos: {
      label: 'Synced to',
      items: [LOGOS.attio, LOGOS.hubspot, LOGOS.salesforce, LOGOS.odoo]
    }
  },
  {
    step: 'Hand the queue over',
    title: 'The queue is ready before they sit down',
    body: 'One link, the whole day. Ringee never calls for you — it clears the way for your rep.',
    surface: { label: 'your agent · ringee mcp', kind: 'chat' },
    prompt: "Build today's queue from Attio and send the link to the team.",
    tool: 'ringee · create_call_session',
    rows: [
      { label: 'app.ringee.io/s/q7fk2m', value: '25 queued', accent: true },
      { label: 'Dialed by', value: 'your rep' },
      { label: 'Browser · 180+ countries', value: '$0.012/min' }
    ]
  },
  {
    step: 'Write the call back',
    title: 'Nobody retypes their day into Attio',
    body: 'Outcome, notes and the next step land back on the record, straight from the transcript.',
    surface: { label: 'claude code · ringee cli', kind: 'cli' },
    prompt: 'claude "/ringee-followup log that call and book the callback"',
    tool: 'ringee · log_call_outcome',
    rows: [
      { label: 'Outcome', value: 'interested', accent: true },
      { label: 'Callback', value: 'Thu · 10:00' },
      { label: 'Attio record', value: 'updated', accent: true }
    ],
    logos: { label: 'Written back to', items: [LOGOS.attio] }
  }
];

/* ------------------------------------------------------------------ */
/* atoms                                                               */
/* ------------------------------------------------------------------ */

function CompanyLogo({ logo }: { logo: Logo }) {
  return (
    <Image
      src={logo.src}
      alt={logo.alt}
      width={180}
      height={48}
      sizes='96px'
      style={{ height: logo.height, maxWidth: logo.maxWidth }}
      className={cn(
        'w-auto object-contain',
        logo.invertOnDark && 'dark:invert'
      )}
    />
  );
}

function ResultRow({ row, index }: { row: Row; index: number }) {
  return (
    <div
      data-row={index}
      className='border-border/60 bg-background/60 flex items-center justify-between gap-3 rounded-lg border px-3 py-2'
    >
      <span className='text-muted-foreground truncate font-mono text-xs'>
        {row.label}
      </span>
      <span
        className={cn(
          'shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs',
          row.accent
            ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
            : 'border-border/70 text-muted-foreground'
        )}
      >
        {row.value}
      </span>
    </div>
  );
}

/** The transcript panel: one prompt, the tool it calls, what came back. */
function SceneCard({ scene, index }: { scene: Scene; index: number }) {
  const isCli = scene.surface.kind === 'cli';

  return (
    <div>
      {/* The rail carries the numbering once it exists; below `md` it doesn't. */}
      <div data-reveal='1' className='flex items-center gap-3 md:hidden'>
        <span className='font-mono text-xs text-emerald-600 dark:text-emerald-400'>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className='bg-border h-px w-7' />
        <span className='text-muted-foreground font-mono text-xs tracking-widest uppercase'>
          {scene.step}
        </span>
      </div>

      <h3
        data-reveal='2'
        className='text-foreground mt-3 text-xl font-semibold tracking-tight text-balance md:mt-0 lg:text-2xl'
      >
        {scene.title}
      </h3>
      <p
        data-reveal='3'
        className='text-muted-foreground mt-2 text-sm leading-relaxed text-pretty'
      >
        {scene.body}
      </p>

      <div className='relative mt-5'>
        {/* A breath of light behind the panel so it reads as the focal object
            rather than one more bordered box on the page. */}
        <div
          aria-hidden
          className='pointer-events-none absolute -inset-x-8 -top-10 -bottom-8 -z-10 bg-[radial-gradient(55%_50%_at_50%_0%,rgba(16,185,129,0.12),transparent_72%)]'
        />
        <div
          data-panel
          className='border-border/70 bg-card rounded-2xl border shadow-xl shadow-black/5 dark:shadow-black/30'
        >
          <div className='border-border/60 flex items-center gap-2.5 border-b px-4 py-2.5'>
            <span className='flex gap-1.5' aria-hidden>
              <span className='bg-muted-foreground/25 h-2 w-2 rounded-full' />
              <span className='bg-muted-foreground/25 h-2 w-2 rounded-full' />
              <span className='h-2 w-2 rounded-full bg-emerald-500/70' />
            </span>
            <p className='text-muted-foreground font-mono text-xs'>
              {scene.surface.label}
            </p>
          </div>

          <div className='p-4 sm:p-5'>
            <div className='flex items-start gap-2.5'>
              <span
                className='shrink-0 font-mono text-xs text-emerald-600 dark:text-emerald-400'
                aria-hidden
              >
                {isCli ? '$' : '▸'}
              </span>
              <p
                className={cn(
                  'font-mono text-xs leading-relaxed sm:text-sm',
                  isCli ? 'text-muted-foreground' : 'text-foreground'
                )}
              >
                {scene.prompt}
              </p>
            </div>

            <div className='mt-3.5 flex items-center gap-2'>
              <span
                className='ringee-pulse h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500'
                aria-hidden
              />
              <p className='text-muted-foreground font-mono text-xs'>
                {scene.tool}
              </p>
            </div>

            <div className='mt-3.5 space-y-2'>
              {scene.rows.map((row, rowIndex) => (
                <ResultRow key={row.label} row={row} index={rowIndex + 1} />
              ))}
            </div>

            {scene.logos ? (
              <div className='border-border/60 mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-t pt-4'>
                <span className='text-muted-foreground font-mono text-[11px] tracking-widest uppercase'>
                  {scene.logos.label}
                </span>
                {scene.logos.items.map((logo) => (
                  <CompanyLogo key={logo.alt} logo={logo} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* left column                                                         */
/* ------------------------------------------------------------------ */

/**
 * The four steps as a clickable rail. It replaces both a horizontal progress
 * bar and the prose block that used to spell out the division of labour: read
 * top to bottom it *is* the argument, in eight words.
 *
 * Rows are equal height by construction, so the emerald marker is positioned by
 * a single translate rather than measuring the DOM.
 */
function StepRail({
  active,
  onJump
}: {
  active: number;
  onJump: (index: number) => void;
}) {
  return (
    <div className='relative mt-7 hidden md:block'>
      <span aria-hidden className='bg-border absolute inset-y-0 left-0 w-px' />
      <span
        aria-hidden
        style={{
          height: `${100 / SCENES.length}%`,
          transform: `translateY(${active * 100}%)`
        }}
        className='absolute top-0 left-0 w-px bg-emerald-500 transition-transform duration-500 ease-out'
      />
      <ol>
        {SCENES.map((scene, index) => {
          const isActive = index === active;
          return (
            <li key={scene.step}>
              <button
                type='button'
                onClick={() => onJump(index)}
                aria-current={isActive}
                className='group flex h-10 w-full items-center gap-3 pl-5 text-left focus-visible:outline-none'
              >
                <span
                  className={cn(
                    'font-mono text-xs transition-colors duration-300',
                    isActive
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-muted-foreground/60'
                  )}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span
                  className={cn(
                    'text-sm transition-colors duration-300',
                    isActive
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground group-hover:text-foreground/80'
                  )}
                >
                  {scene.step}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Price and CTA. Rendered twice — inside the sticky column on desktop, and once
 * more after the transcripts on mobile, where a CTA between the pitch and the
 * proof would be asking for the sale too early.
 */
function PriceBand({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3.5 rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/10 to-transparent px-5 py-4',
        className
      )}
    >
      <p className='text-muted-foreground text-sm leading-relaxed text-pretty'>
        <span className='text-foreground font-semibold'>
          ${PRICING.organization.price}/month flat
        </span>{' '}
        for the whole team, minutes from $0.012 — instead of $30 a seat.
      </p>
      <Link
        href={REQUEST_DEMO_URL}
        className='focus-visible:ring-offset-background inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-700/20 transition-all hover:bg-emerald-700/90 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98]'
      >
        Request demo
        <ArrowRight className='h-4 w-4' aria-hidden />
      </Link>
    </div>
  );
}

/** The sticky left column: the lockup, the thesis, the rail, the agents. */
function Thesis({
  active,
  onJump
}: {
  active: number;
  onJump: (index: number) => void;
}) {
  return (
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

      <h2 className='text-foreground mt-6 text-3xl font-bold tracking-tight text-balance lg:text-4xl'>
        The calling layer that fits Attio.{' '}
        <span className='text-muted-foreground'>Both run from your agent.</span>
      </h2>

      <p className='text-muted-foreground mt-4 text-base leading-relaxed text-pretty'>
        Attio is the agentic CRM. Ringee is the agentic dialer. Point one agent
        at both: it does everything around the call, your rep just talks.
      </p>

      <StepRail active={active} onJump={onJump} />

      <div className='border-border/60 mt-7 flex flex-wrap items-center gap-x-4 gap-y-3 border-t pt-5'>
        <span className='text-muted-foreground font-mono text-[11px] tracking-widest uppercase'>
          Runs from
        </span>
        <div className='flex items-center gap-4'>
          {AGENTS.map((agent) => {
            const Logo = agent.logo;
            return (
              <span
                key={agent.name}
                role='img'
                aria-label={agent.name}
                title={agent.name}
                className='text-muted-foreground/70 hover:text-foreground transition-colors duration-200'
              >
                <Logo className='h-5 w-5' />
              </span>
            );
          })}
        </div>
        <span className='text-muted-foreground text-xs'>
          + any MCP client, or the CLI
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* section                                                             */
/* ------------------------------------------------------------------ */

export function AgenticCrmFlow() {
  const sceneRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Which step the rail marker sits on: the transcript nearest the reading line.
  const [active, setActive] = useState(0);
  // How far down the list the reader has got. Monotonic — a panel that has
  // eased in stays in, including on the way back up. -1 until the first
  // measurement so each one animates the first time it appears.
  const [revealed, setRevealed] = useState(-1);

  useEffect(() => {
    let frame: number | null = null;

    const measure = () => {
      frame = null;
      // Slightly above centre: the eye settles there, not at the midpoint.
      const readingLine = window.innerHeight * 0.42;
      let nearest = 0;
      let nearestDistance = Infinity;
      let lastInView = -1;

      sceneRefs.current.forEach((element, index) => {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - readingLine);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = index;
        }
        // Scenes are in document order, so the last one whose top has crossed
        // the fold is the furthest the reader has reached.
        if (rect.top < window.innerHeight * 0.85) lastInView = index;
      });

      setActive(nearest);
      setRevealed((current) => Math.max(current, lastInView));
    };

    const onScroll = () => {
      if (frame === null) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  const jumpTo = useCallback((index: number) => {
    const element = sceneRefs.current[index];
    if (!element) return;
    // Leave room for the 4rem navbar plus a little air above the heading.
    window.scrollTo({
      top: window.scrollY + element.getBoundingClientRect().top - 128,
      behavior: 'smooth'
    });
  }, []);

  return (
    <section
      aria-label='Attio and Ringee, run from your AI agent'
      className='relative w-full py-16 sm:py-24'
    >
      <Container>
        {/* Default `stretch` alignment is load-bearing: the left column has to
            fill the row for the sticky block inside it to have somewhere to
            travel as the transcripts scroll past. */}
        <div className='flex flex-col gap-12 md:flex-row md:gap-12 lg:gap-16'>
          <div className='md:w-5/12'>
            <div className='md:sticky md:top-24'>
              <Thesis active={active} onJump={jumpTo} />
              <PriceBand className='mt-6 hidden md:flex' />
            </div>
          </div>

          <div className='flex flex-col gap-16 md:w-7/12 lg:gap-24'>
            {SCENES.map((scene, index) => (
              <div
                key={scene.step}
                ref={(node) => {
                  sceneRefs.current[index] = node;
                }}
                className='ringee-scene'
                data-active={index <= revealed}
              >
                <SceneCard scene={scene} index={index} />
              </div>
            ))}
          </div>
        </div>

        <PriceBand className='mt-12 md:hidden' />
      </Container>
    </section>
  );
}
