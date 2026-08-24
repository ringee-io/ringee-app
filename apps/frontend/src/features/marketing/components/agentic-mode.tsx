'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';

import { ChatGptLogo, ClaudeLogo } from './agent-logos';
import { AGENT_MARKS, RunsFrom } from './agent-marks';
import type { Mark } from './agent-marks';
import { COMPANY_LOGOS as LOGOS } from './company-logos';
import {
  BrowserChrome,
  CardRows,
  ConnectorCard,
  Divider,
  Panel,
  StepRail,
  TagBadge,
  ToolLine,
  Wide,
  WindowDots,
  stepNumber,
  useFlowScroll
} from './flow-primitives';
import type { Connector, Row, Sync } from './flow-primitives';
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
  sync: Sync;
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

/** Who is holding this step. Two values, and the difference is the pitch. */
function WhoBadge({ who }: { who: Step['who'] }) {
  return (
    <TagBadge
      label={who === 'rep' ? 'Your rep' : 'Your agent'}
      accent={who === 'rep'}
    />
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
    <Panel sync={step.sync} chrome={<BrowserChrome url={surface.url} />}>
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

/* ------------------------------------------------------------------ */
/* section                                                             */
/* ------------------------------------------------------------------ */

export function AgenticMode() {
  const { stepRefs, active, revealed, jumpTo } = useFlowScroll();

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
              <StepRail phases={PHASES} active={active} onJump={jumpTo} />
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
