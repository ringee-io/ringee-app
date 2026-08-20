'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';

import { ChatGptLogo, ClaudeLogo } from './agent-logos';
import { AGENT_MARKS, MarkIcon, RunsFrom } from './agent-marks';
import type { Mark } from './agent-marks';
import { COMPANY_LOGOS as LOGOS, CompanyLogo } from './company-logos';
import type { CompanyLogoSpec } from './company-logos';
import { GoogleMeetLogo } from './google-logos';
import { REQUEST_DEMO_URL } from '../site';

/**
 * "Agentic mode" — the full-bleed section on the home page that lays out the
 * entire Ringee loop, from the connections you make once to the seven steps
 * that run on top of them.
 *
 * It reads in two movements. First **connect**: a lead source, a CRM, a
 * calendar, an agent — four cards across the full width, each naming the steps
 * it feeds. Then **the loop**, grouped into three phases so the shape is
 * legible before any of the detail is: everything *before* the call is the
 * agent's, *the call* is a person's, everything *after* is the agent's again.
 * That grouping is the argument, so it is what the rail and the dividers show.
 *
 * Each step is drawn in the surface it actually runs in. A prompt in ChatGPT or
 * Claude gets a chat window; `claude` and `codex` get a real terminal — dark in
 * both themes, zsh prompt, output as plain aligned monospace; the call itself
 * gets a browser frame around the session link, because that is literally what
 * the rep opens. You should be able to tell where a step happens without
 * reading a word of it.
 *
 * Every panel is split: what was said and what came back on the left, where it
 * landed — with the partner marks — on the right. That split is what earns the
 * full width, and it is where the section makes its claim: each step syncs
 * outward on its own, so no one retypes anything between them.
 *
 * Nothing is hidden or swapped as you scroll. Panels ease in the first time you
 * reach them and stay on the page.
 */

/* ------------------------------------------------------------------ */
/* connections                                                         */
/* ------------------------------------------------------------------ */

type Connector = {
  label: string;
  line: string;
  /** Which steps of the loop this connection feeds — the thread between the
      two movements of the section. */
  feeds: string;
  logos?: CompanyLogoSpec[];
  marks?: Mark[];
  /** The escape hatch under the logos, where one exists. */
  note?: string;
};

const CONNECTORS: Connector[] = [
  {
    label: 'Lead source',
    line: 'Search a segment and reveal direct dials on your provider credits.',
    feeds: 'Feeds 01 · 02',
    logos: [LOGOS.apollo, LOGOS.prospeo]
  },
  {
    label: 'CRM',
    line: 'Your system of record stays the source of truth.',
    feeds: 'Feeds 03 · 06',
    logos: [LOGOS.attio, LOGOS.hubspot, LOGOS.salesforce, LOGOS.odoo],
    note: 'Custom CRM? Webhooks + REST API.'
  },
  {
    label: 'Calendar',
    line: 'Meetings booked to Google Calendar, invite carries the Meet link.',
    feeds: 'Feeds 07',
    marks: [{ name: 'Google Meet', logo: GoogleMeetLogo }]
  },
  {
    label: 'Agent',
    line: 'The AI you already use drives all of it.',
    feeds: 'Feeds 01 → 07',
    marks: AGENT_MARKS,
    note: 'Any MCP client, or the CLI.'
  }
];

/* ------------------------------------------------------------------ */
/* the loop                                                            */
/* ------------------------------------------------------------------ */

type Row = { label: string; value: string; accent?: boolean };

/** Where a step runs. Each one gets its own chrome. */
type Surface =
  | { kind: 'chat'; app: string; mark?: Mark }
  | { kind: 'cli'; app: string; cwd: string }
  | { kind: 'browser'; url: string };

type Step = {
  /** Rail label and panel heading — the tool step, named plainly. */
  name: string;
  /** Who does it. The whole positioning of the product is in this field. */
  who: 'agent' | 'rep';
  /** One line. If the panel already shows it, it does not belong here. */
  line: string;
  surface: Surface;
  /** The prompt, the command, or — for the browser — what the rep does. */
  prompt: string;
  tool: string;
  rows: Row[];
  /** Where the step lands, shown beside the transcript. */
  sync: {
    label: string;
    logos?: CompanyLogoSpec[];
    marks?: Mark[];
    note?: string;
  };
};

type Phase = {
  label: string;
  /** One clause. What this phase is for, and who is holding it. */
  note: string;
  steps: Step[];
};

const PHASES: Phase[] = [
  {
    label: 'Before the call',
    note: 'Your agent builds the list',
    steps: [
      {
        name: 'Prospect',
        who: 'agent',
        line: 'Ask for the segment. You never build a list by hand again.',
        surface: {
          kind: 'chat',
          app: 'ChatGPT',
          mark: { name: 'ChatGPT', logo: ChatGptLogo }
        },
        prompt: 'Find VP Sales at Series A fintechs in Madrid.',
        tool: 'ringee · search_leads',
        rows: [
          { label: '312 matches', value: 'jobId ready', accent: true },
          { label: 'Title · stage · geo', value: 'filtered' }
        ],
        sync: {
          label: 'Sourced from',
          logos: [LOGOS.apollo, LOGOS.prospeo],
          note: 'Searching costs nothing. Nothing is revealed yet.'
        }
      },
      {
        name: 'Reveal / Import lead',
        who: 'agent',
        line: 'Direct dials only for the ones you keep.',
        surface: { kind: 'cli', app: 'claude', cwd: '~/acme' },
        prompt: 'claude "/ringee-prospect reveal the top 25 and import them"',
        tool: 'ringee · reveal_lead → import_leads_as_contacts',
        rows: [
          { label: '25 revealed', value: '+34 direct', accent: true },
          { label: 'Provider credits', value: 'Apollo' },
          { label: 'Ringee credits', value: 'none', accent: true }
        ],
        sync: {
          label: 'Enriched by',
          logos: [LOGOS.apollo, LOGOS.prospeo],
          note: 'Reveals spend your provider credits, never Ringee minutes.'
        }
      },
      {
        name: 'Create / Update contact',
        who: 'agent',
        line: 'Deduped in Ringee, mirrored to the record you already keep.',
        surface: { kind: 'chat', app: 'Your agent', mark: undefined },
        prompt: 'Import them as contacts and reflect them in the CRM.',
        tool: 'ringee · create_contact / update_contact',
        rows: [
          { label: '22 created · 3 merged', value: 'deduped', accent: true },
          { label: 'Tags', value: 'fintech · madrid' },
          { label: 'CRM record', value: 'in sync', accent: true }
        ],
        sync: {
          label: 'Synced to',
          logos: [LOGOS.attio, LOGOS.hubspot, LOGOS.salesforce, LOGOS.odoo],
          note: 'Or your own CRM, over webhooks and the REST API.'
        }
      }
    ]
  },
  {
    label: 'The call',
    note: 'A person picks up the phone',
    steps: [
      {
        name: 'Create call session',
        who: 'agent',
        line: 'The whole day behind one link, ready before anyone sits down.',
        surface: { kind: 'cli', app: 'codex', cwd: '~/acme' },
        prompt: 'codex "build today\'s queue from the Madrid fintech list"',
        tool: 'ringee · create_call_session',
        rows: [
          { label: 'app.ringee.io/s/q7fk2m', value: '25 queued', accent: true },
          { label: 'Shared with', value: '3 reps' },
          { label: 'Revoke', value: 'any time' }
        ],
        sync: {
          label: 'Handed to',
          note: 'No install, no seat, no CRM tab. The link is the dialer.'
        }
      },
      {
        name: 'Call',
        who: 'rep',
        line: 'A person dials. Ringee never places the call for you.',
        surface: { kind: 'browser', url: 'app.ringee.io/s/q7fk2m' },
        prompt: 'Your rep opens the link and works the queue.',
        tool: 'ringee · recording + live transcript',
        rows: [
          {
            label: 'Browser · 180+ countries',
            value: '$0.012/min',
            accent: true
          },
          { label: 'Recording · transcript', value: 'on' },
          { label: 'Local caller ID', value: 'matched' }
        ],
        sync: {
          label: 'Human in the loop',
          note: 'The one step no agent takes. Everything around it is automated.'
        }
      }
    ]
  },
  {
    label: 'After the call',
    note: 'Your agent writes it back',
    steps: [
      {
        name: 'Log outcome',
        who: 'agent',
        line: 'Written from the transcript, not from memory.',
        surface: { kind: 'cli', app: 'claude', cwd: '~/acme' },
        prompt: 'claude "/ringee-followup log that call"',
        tool: 'ringee · log_call_outcome',
        rows: [
          { label: 'Outcome', value: 'interested', accent: true },
          { label: 'Notes', value: 'from transcript' },
          { label: 'CRM record', value: 'updated', accent: true }
        ],
        sync: {
          label: 'Written back to',
          logos: [LOGOS.attio, LOGOS.hubspot, LOGOS.salesforce, LOGOS.odoo],
          note: 'Nobody retypes their day into the CRM at 6pm.'
        }
      },
      {
        name: 'Callback / Meeting',
        who: 'agent',
        line: 'The next touch is booked before the rep hangs up.',
        surface: {
          kind: 'chat',
          app: 'Claude',
          mark: { name: 'Claude', logo: ClaudeLogo }
        },
        prompt: 'Book the callback for Thursday and send the invite.',
        tool: 'ringee · create_callback / schedule_meeting',
        rows: [
          { label: 'Callback', value: 'Thu · 10:00', accent: true },
          { label: 'Meeting invite', value: 'sent', accent: true },
          { label: 'Reminder', value: 'queued' }
        ],
        sync: {
          label: 'Booked in',
          marks: [{ name: 'Google Meet', logo: GoogleMeetLogo }],
          note: 'Google Calendar, with a Meet link on the invite.'
        }
      }
    ]
  }
];

/* ------------------------------------------------------------------ */
/* atoms                                                               */
/* ------------------------------------------------------------------ */

/** Centred wrapper. Wider than the rest of the page — the section is the width. */
function Wide({
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

function stepNumber(index: number) {
  return String(index + 1).padStart(2, '0');
}

/** A labelled rule. Used for both movements and for each phase of the loop. */
function Divider({
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

/** Who is holding this step. Two values, and the difference is the pitch. */
function WhoBadge({ who }: { who: Step['who'] }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-widest uppercase',
        who === 'rep'
          ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
          : 'border-border/70 text-muted-foreground'
      )}
    >
      {who === 'rep' ? 'Your rep' : 'Your agent'}
    </span>
  );
}

/** Result rows on a themed card. */
function CardRows({ rows }: { rows: Row[] }) {
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

/** The same rows as terminal output: no boxes, just aligned monospace. */
function TerminalRows({ rows }: { rows: Row[] }) {
  return (
    <div className='mt-2 space-y-1'>
      {rows.map((row, index) => (
        <div
          key={row.label}
          data-row={index + 1}
          className='flex items-baseline justify-between gap-4 font-mono text-xs'
        >
          <span className='truncate text-zinc-400'>{row.label}</span>
          <span
            className={cn(
              'shrink-0',
              row.accent ? 'text-emerald-400' : 'text-zinc-500'
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
function SyncColumn({
  sync,
  onDark
}: {
  sync: Step['sync'];
  onDark?: boolean;
}) {
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

/** Shared frame: chrome on top, then the split body. */
function Panel({
  chrome,
  onDark,
  children,
  sync
}: {
  chrome: React.ReactNode;
  onDark?: boolean;
  children: React.ReactNode;
  sync: Step['sync'];
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
      <div className='grid gap-6 p-4 sm:p-5 xl:grid-cols-[1.5fr_1fr] xl:gap-8'>
        <div>{children}</div>
        <SyncColumn sync={sync} onDark={onDark} />
      </div>
    </div>
  );
}

/** The three window buttons. Real colours on the terminal, quiet dots elsewhere. */
function WindowDots({ onDark }: { onDark?: boolean }) {
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

/** The tool call, under the prompt: a breathing dot and the MCP tool name. */
function ToolLine({ tool, onDark }: { tool: string; onDark?: boolean }) {
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

/* ------------------------------------------------------------------ */
/* the three surfaces                                                  */
/* ------------------------------------------------------------------ */

/** `claude`, `codex`, `ringee` — a real terminal, dark in both themes. */
function TerminalSurface({ step }: { step: Step }) {
  const surface = step.surface as Extract<Surface, { kind: 'cli' }>;

  return (
    <Panel
      onDark
      sync={step.sync}
      chrome={
        <div className='flex items-center gap-2.5 border-b border-white/10 bg-zinc-900 px-4 py-2.5'>
          <WindowDots onDark />
          <p className='truncate font-mono text-xs text-zinc-400'>
            {surface.app} — {surface.cwd} — zsh
          </p>
        </div>
      }
    >
      <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-xs sm:text-sm'>
        <span className='text-emerald-400' aria-hidden>
          ➜
        </span>
        <span className='text-sky-400'>{surface.cwd}</span>
        <span className='text-zinc-100'>{step.prompt}</span>
      </div>

      <ToolLine tool={step.tool} onDark />
      <TerminalRows rows={step.rows} />

      <span
        className='ringee-pulse mt-2 inline-block h-3.5 w-2 bg-zinc-400 align-middle'
        aria-hidden
      />
    </Panel>
  );
}

/** ChatGPT, Claude, or any other MCP client: a chat window. */
function ChatSurface({ step }: { step: Step }) {
  const surface = step.surface as Extract<Surface, { kind: 'chat' }>;
  const MarkLogo = surface.mark?.logo;

  return (
    <Panel
      sync={step.sync}
      chrome={
        <div className='border-border/60 flex items-center gap-2.5 border-b px-4 py-2.5'>
          {MarkLogo ? (
            <MarkLogo className='text-foreground h-4 w-4 shrink-0' />
          ) : (
            <Sparkles className='text-muted-foreground h-4 w-4 shrink-0' />
          )}
          <p className='text-muted-foreground font-mono text-xs'>
            {surface.app} · ringee mcp
          </p>
        </div>
      }
    >
      {/* The ask, as the reader would have typed it. */}
      <div className='flex justify-end'>
        <p className='bg-muted/60 border-border/60 text-foreground max-w-[95%] rounded-2xl rounded-br-md border px-3.5 py-2.5 text-sm leading-relaxed'>
          {step.prompt}
        </p>
      </div>

      <ToolLine tool={step.tool} />
      <CardRows rows={step.rows} />
    </Panel>
  );
}

/** The session link, in the thing the rep actually opens. */
function BrowserSurface({ step }: { step: Step }) {
  const surface = step.surface as Extract<Surface, { kind: 'browser' }>;

  return (
    <Panel
      sync={step.sync}
      chrome={
        <div className='border-border/60 flex items-center gap-3 border-b px-4 py-2.5'>
          <WindowDots />
          <div className='border-border/70 bg-background/70 flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-1'>
            <Lock className='h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400' />
            <span className='text-muted-foreground truncate font-mono text-xs'>
              {surface.url}
            </span>
          </div>
        </div>
      }
    >
      <p className='text-foreground text-sm leading-relaxed'>{step.prompt}</p>
      <ToolLine tool={step.tool} />
      <CardRows rows={step.rows} />
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
        <WhoBadge who={step.who} />
      </div>
      <p
        data-reveal='3'
        className='text-muted-foreground mt-2 text-sm leading-relaxed text-pretty'
      >
        {step.line}
      </p>

      {step.surface.kind === 'cli' ? (
        <TerminalSurface step={step} />
      ) : step.surface.kind === 'browser' ? (
        <BrowserSurface step={step} />
      ) : (
        <ChatSurface step={step} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* rail                                                                */
/* ------------------------------------------------------------------ */

/**
 * The loop as a clickable rail, grouped into the same three phases as the
 * column beside it. The continuous hairline is drawn by the rows themselves, so
 * the phase headings sit *on* the line rather than breaking it — and only the
 * active step's segment goes emerald.
 */
function StepRail({
  active,
  onJump
}: {
  active: number;
  onJump: (index: number) => void;
}) {
  let index = -1;

  return (
    <div className='hidden lg:block'>
      {PHASES.map((phase) => (
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

/**
 * The closing claim and the CTA. Rendered twice — pinned under the rail on
 * desktop, and once more after the last step on mobile, where a CTA between the
 * section header and the loop would be asking for the sale before the argument.
 */
function LoopNote({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'border-border/60 flex flex-col items-start gap-4',
        className
      )}
    >
      <RunsFrom />

      <p className='text-muted-foreground text-sm leading-relaxed text-pretty'>
        <span className='text-foreground font-semibold'>
          Every step is one MCP tool call.
        </span>{' '}
        Same seven from ChatGPT, from Claude Code or Codex, or from a cron job
        on your own box.
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

function ConnectorCard({
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
/* section                                                             */
/* ------------------------------------------------------------------ */

export function AgenticMode() {
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Which step the rail marker sits on: the transcript nearest the reading line.
  const [active, setActive] = useState(0);
  // How far down the loop the reader has got. Monotonic — a panel that has
  // eased in stays in, including on the way back up.
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

  // Running count across phases, so a step's number is its place in the loop.
  let stepIndex = -1;

  return (
    <section
      id='agentic-mode'
      aria-label='Agentic mode — the Ringee outbound loop'
      className='relative w-full py-16 sm:py-24'
    >
      <Wide>
        <div className='max-w-3xl'>
          <p className='font-mono text-xs tracking-widest text-emerald-600 uppercase dark:text-emerald-400'>
            Agentic mode
          </p>
          <h2 className='text-foreground mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl'>
            Connect it once. Your agent runs the loop.
          </h2>
          <p className='text-muted-foreground mt-5 text-lg leading-relaxed text-pretty'>
            Four connections, then seven steps. Your agent takes every one of
            them except the call itself — over MCP from ChatGPT or Claude, or
            from your terminal.
          </p>
        </div>

        {/* Movement one: the connections. */}
        <div className='mt-12 sm:mt-14'>
          <Divider label='Connect once' note='Four accounts, one time' />
          <div className='mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            {CONNECTORS.map((connector, index) => (
              <ConnectorCard
                key={connector.label}
                connector={connector}
                index={index}
              />
            ))}
          </div>
        </div>

        {/* Movement two: the loop, in three phases. */}
        <Divider
          label='Then it runs'
          note='Seven steps, every one a tool call'
          className='mt-16 sm:mt-20'
        />

        {/* Default `stretch` alignment is load-bearing: the left column has to
            fill the row for the sticky block inside it to have somewhere to
            travel as the transcripts scroll past. */}
        <div className='mt-8 flex flex-col gap-10 lg:flex-row lg:gap-12 xl:gap-16'>
          <div className='hidden lg:block lg:w-4/12 xl:w-3/12'>
            <div className='lg:sticky lg:top-24'>
              <StepRail active={active} onJump={jumpTo} />
              <LoopNote className='mt-8 hidden border-t pt-6 lg:flex' />
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

        <LoopNote className='mt-12 lg:hidden' />
      </Wide>
    </section>
  );
}
