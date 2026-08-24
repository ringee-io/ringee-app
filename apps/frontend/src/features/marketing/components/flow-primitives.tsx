'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';

import { MarkIcon } from './agent-marks';
import type { Mark } from './agent-marks';
import { CompanyLogo } from './company-logos';
import type { CompanyLogoSpec } from './company-logos';

/**
 * The shared vocabulary of the two full-bleed "flow" sections on the home page
 * — Ringee everywhere and Agentic mode.
 *
 * Both make the same argument in the same shape: a row of cards you connect (or
 * install) once, then a numbered run of steps, each drawn inside the surface it
 * actually happens in, each split between what you did and where it landed.
 * That shape only reads as one idea told twice if the two sections are pixel
 * identical, so the frame, the rail, the rows and the scroll behaviour live
 * here rather than being copied between them.
 *
 * What stays in each section is only what differs: its own surfaces (a
 * terminal, a phone, a Chrome side panel) and its own copy.
 */

/* ------------------------------------------------------------------ */
/* types                                                               */
/* ------------------------------------------------------------------ */

export type Row = { label: string; value: string; accent?: boolean };

/** Where a step lands. Shown beside the transcript in every surface. */
export type Sync = {
  label: string;
  logos?: CompanyLogoSpec[];
  marks?: Mark[];
  note?: string;
};

/** A card in the first movement: something you connect, or install, once. */
export type Connector = {
  label: string;
  line: string;
  /** Which steps of the run this card feeds — the thread between the two
      movements of a section. */
  feeds: string;
  logos?: CompanyLogoSpec[];
  marks?: Mark[];
  /** The escape hatch under the logos, where one exists. */
  note?: string;
};

/** All the rail needs to know about a step. Sections extend this. */
export type RailPhase = { label: string; steps: { name: string }[] };

/* ------------------------------------------------------------------ */
/* atoms                                                               */
/* ------------------------------------------------------------------ */

/** Centred wrapper. Wider than the rest of the page — the section is the width. */
export function Wide({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('mx-auto w-full max-w-[1560px] px-6 lg:px-10', className)}
    >
      {children}
    </div>
  );
}

export function stepNumber(index: number) {
  return String(index + 1).padStart(2, '0');
}

/** A labelled rule. Used for both movements and for each phase of the run. */
export function Divider({
  label,
  note,
  className
}: {
  label: string;
  note?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <span className='text-muted-foreground font-mono text-[11px] tracking-widest uppercase'>
        {label}
      </span>
      <span className='bg-border h-px flex-1' />
      {note ? (
        <span className='text-muted-foreground/80 hidden text-xs sm:block'>
          {note}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The pill beside a step heading. Each section decides what it names — who is
 * holding the step, or which surface it runs in — but they share the shape, and
 * `accent` marks the one value the section is making a point about.
 */
export function TagBadge({
  label,
  accent
}: {
  label: string;
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-widest uppercase',
        accent
          ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
          : 'border-border/70 text-muted-foreground'
      )}
    >
      {label}
    </span>
  );
}

/** Result rows on a themed card. */
export function CardRows({ rows }: { rows: Row[] }) {
  return (
    <div className='mt-3.5 space-y-2'>
      {rows.map((row, index) => (
        <div
          key={row.label}
          data-row={index + 1}
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
      ))}
    </div>
  );
}

/** Where the step landed. Sits beside the transcript in every surface. */
export function SyncColumn({ sync, onDark }: { sync: Sync; onDark?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col border-t pt-5 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8',
        onDark ? 'border-white/10' : 'border-border/60'
      )}
    >
      <span
        className={cn(
          'font-mono text-[11px] tracking-widest uppercase',
          onDark ? 'text-zinc-500' : 'text-muted-foreground'
        )}
      >
        {sync.label}
      </span>

      {sync.logos || sync.marks ? (
        <div className='mt-4 flex flex-wrap items-center gap-x-5 gap-y-3.5'>
          {sync.logos?.map((logo) => (
            <CompanyLogo key={logo.alt} logo={logo} onDark={onDark} />
          ))}
          {sync.marks?.map((mark) => (
            <MarkIcon key={mark.name} mark={mark} />
          ))}
        </div>
      ) : null}

      {sync.note ? (
        <p
          className={cn(
            'mt-4 text-sm leading-relaxed text-pretty',
            onDark ? 'text-zinc-400' : 'text-muted-foreground'
          )}
        >
          {sync.note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Shared frame: chrome on top, then the body.
 *
 * Both extras are optional, because the frame is the *only* thing every step in
 * every section has in common. `chrome` is dropped when a surface is its own
 * chrome — the phone draws a bezel around the whole body instead of a title bar
 * above it. `sync` is dropped when a mock already shows where the work landed,
 * and the body then takes the full width instead of the 1.5fr column.
 */
export function Panel({
  chrome,
  onDark,
  children,
  sync
}: {
  chrome?: React.ReactNode;
  onDark?: boolean;
  children: React.ReactNode;
  sync?: Sync;
}) {
  return (
    <div
      data-panel
      className={cn(
        'mt-5 overflow-hidden rounded-2xl border shadow-xl',
        onDark
          ? 'border-zinc-800 bg-zinc-950 shadow-black/25'
          : 'border-border/70 bg-card shadow-black/5 dark:shadow-black/30'
      )}
    >
      {chrome}
      {sync ? (
        <div className='grid gap-6 p-4 sm:p-5 xl:grid-cols-[1.5fr_1fr] xl:gap-8'>
          <div>{children}</div>
          <SyncColumn sync={sync} onDark={onDark} />
        </div>
      ) : (
        <div className='p-4 sm:p-5'>{children}</div>
      )}
    </div>
  );
}

/** The three window buttons. Real colours on the terminal, quiet dots elsewhere. */
export function WindowDots({ onDark }: { onDark?: boolean }) {
  return (
    <span className='flex shrink-0 gap-1.5' aria-hidden>
      {onDark ? (
        <>
          <span className='h-2.5 w-2.5 rounded-full bg-[#ff5f57]' />
          <span className='h-2.5 w-2.5 rounded-full bg-[#febc2e]' />
          <span className='h-2.5 w-2.5 rounded-full bg-[#28c840]' />
        </>
      ) : (
        <>
          <span className='bg-muted-foreground/25 h-2 w-2 rounded-full' />
          <span className='bg-muted-foreground/25 h-2 w-2 rounded-full' />
          <span className='h-2 w-2 rounded-full bg-emerald-500/70' />
        </>
      )}
    </span>
  );
}

/** A browser title bar: window buttons and the address the reader would see. */
export function BrowserChrome({
  url,
  children
}: {
  url: string;
  /** Anything that belongs to the right of the address bar — a toolbar icon. */
  children?: React.ReactNode;
}) {
  return (
    <div className='border-border/60 flex items-center gap-3 border-b px-4 py-2.5'>
      <WindowDots />
      <div className='border-border/70 bg-background/70 flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-1'>
        <Lock className='h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400' />
        <span className='text-muted-foreground truncate font-mono text-xs'>
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}

/** The line under the prompt: a breathing dot and what Ringee is doing. */
export function ToolLine({ tool, onDark }: { tool: string; onDark?: boolean }) {
  return (
    <div className='mt-3.5 flex items-center gap-2'>
      <span
        className='ringee-pulse h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500'
        aria-hidden
      />
      <p
        className={cn(
          'font-mono text-xs',
          onDark ? 'text-zinc-400' : 'text-muted-foreground'
        )}
      >
        {tool}
      </p>
    </div>
  );
}

/** One card in the first movement of a section. */
export function ConnectorCard({
  connector,
  index
}: {
  connector: Connector;
  index: number;
}) {
  return (
    <div className='border-border/70 bg-card flex flex-col rounded-2xl border p-5 shadow-sm'>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2.5'>
          <span className='font-mono text-xs text-emerald-600 dark:text-emerald-400'>
            {stepNumber(index)}
          </span>
          <span className='text-muted-foreground font-mono text-[11px] tracking-widest uppercase'>
            {connector.label}
          </span>
        </div>
        <span className='text-muted-foreground/60 font-mono text-[10px] tracking-widest uppercase'>
          {connector.feeds}
        </span>
      </div>

      <div className='mt-5 flex min-h-[26px] flex-wrap items-center gap-x-5 gap-y-3'>
        {connector.logos?.map((logo) => (
          <CompanyLogo key={logo.alt} logo={logo} />
        ))}
        {connector.marks?.map((mark) => (
          <MarkIcon
            key={mark.name}
            mark={mark}
            wrapperClassName='text-foreground/80 hover:text-foreground transition-colors duration-200'
          />
        ))}
      </div>

      <p className='text-muted-foreground mt-5 text-sm leading-relaxed text-pretty'>
        {connector.line}
      </p>

      {connector.note ? (
        <p className='text-muted-foreground/80 mt-auto pt-4 font-mono text-[11px]'>
          {connector.note}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* rail                                                                */
/* ------------------------------------------------------------------ */

/**
 * The run as a clickable rail, grouped into the same phases as the column
 * beside it. The continuous hairline is drawn by the rows themselves, so the
 * phase headings sit *on* the line rather than breaking it — and only the
 * active step's segment goes emerald.
 */
export function StepRail({
  phases,
  active,
  onJump
}: {
  phases: RailPhase[];
  active: number;
  onJump: (index: number) => void;
}) {
  let index = -1;

  return (
    <div className='hidden lg:block'>
      {phases.map((phase) => (
        <div key={phase.label}>
          <div className='border-border border-l pt-5 pb-2 pl-5 first:pt-0'>
            <p className='text-muted-foreground/70 font-mono text-[10px] tracking-widest uppercase'>
              {phase.label}
            </p>
          </div>
          {phase.steps.map((step) => {
            index += 1;
            const stepIndex = index;
            const isActive = stepIndex === active;
            return (
              <button
                key={step.name}
                type='button'
                onClick={() => onJump(stepIndex)}
                aria-current={isActive}
                className={cn(
                  'group flex h-10 w-full items-center gap-3 border-l pl-5 text-left transition-colors duration-300 focus-visible:outline-none',
                  isActive ? 'border-emerald-500' : 'border-border'
                )}
              >
                <span
                  className={cn(
                    'font-mono text-xs transition-colors duration-300',
                    isActive
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-muted-foreground/60'
                  )}
                >
                  {stepNumber(stepIndex)}
                </span>
                <span
                  className={cn(
                    'text-sm transition-colors duration-300',
                    isActive
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground group-hover:text-foreground/80'
                  )}
                >
                  {step.name}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* scroll                                                              */
/* ------------------------------------------------------------------ */

/**
 * Which step the rail marks, and how far down the reader has got.
 *
 * Nothing is ever hidden or swapped: `revealed` is monotonic, so a panel that
 * has eased in stays in, including on the way back up. `active` is just the
 * transcript nearest the reading line, and it is only ever used to move the
 * rail marker.
 */
export function useFlowScroll() {
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
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

      stepRefs.current.forEach((element, index) => {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - readingLine);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = index;
        }
        // Steps are in document order, so the last one whose top has crossed
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
    const element = stepRefs.current[index];
    if (!element) return;
    // Leave room for the 4rem navbar plus a little air above the heading.
    window.scrollTo({
      top: window.scrollY + element.getBoundingClientRect().top - 128,
      behavior: 'smooth'
    });
  }, []);

  return { stepRefs, active, revealed, jumpTo };
}
