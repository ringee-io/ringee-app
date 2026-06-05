'use client';

/**
 * Landing-only mock twin of the campaign dialing workspace
 * (`features/dialer-session/components/call-session-workspace.tsx` and its
 * panels). It reproduces the full three-pane operator view — queue, softphone,
 * disposition — but auto-plays a scripted campaign on sample data, with no
 * telephony, stores or backend. Lets the marketing site show the whole campaign
 * panorama without touching the real session stack.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  Building2,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  Grid3X3,
  Hash,
  Layers,
  Loader2,
  Mic,
  Pause,
  Phone,
  PhoneCall,
  PhoneOff,
  ShieldCheck,
  SkipForward,
  Wallet,
  Zap
} from 'lucide-react';
import { useStepLoop, useInViewRef } from '../showcase-primitives';

/* ------------------------------------------------------------------ */
/* Mock data                                                           */
/* ------------------------------------------------------------------ */

type Lead = {
  name: string;
  company: string;
  phone: string;
  outcome: string;
  tone: 'positive' | 'neutral' | 'negative';
};

const QUEUE: Lead[] = [
  {
    name: 'Ava Chen',
    company: 'Northwind Labs',
    phone: '+1 415 ••• 0192',
    outcome: 'interested',
    tone: 'positive'
  },
  {
    name: 'Marco Ruiz',
    company: 'Vela Studio',
    phone: '+34 911 ••• 87',
    outcome: 'no_answer',
    tone: 'neutral'
  },
  {
    name: 'Lena Park',
    company: 'Orbit HR',
    phone: '+1 312 ••• 7741',
    outcome: 'callback_scheduled',
    tone: 'neutral'
  },
  {
    name: 'Tom Becker',
    company: 'Kite & Co',
    phone: '+49 30 ••• 9920',
    outcome: 'voicemail',
    tone: 'neutral'
  },
  {
    name: 'Priya Nair',
    company: 'Lumen AI',
    phone: '+44 20 ••• 0321',
    outcome: 'meeting_booked',
    tone: 'positive'
  }
];

const OUTCOME_LABELS: Record<string, string> = {
  meeting_booked: 'Meeting booked',
  sale: 'Sale',
  interested: 'Interested',
  follow_up: 'Follow up',
  callback_scheduled: 'Callback',
  not_interested: 'Not interested',
  no_answer: 'No answer',
  voicemail: 'Voicemail',
  wrong_number: 'Wrong number',
  gatekeeper: 'Gatekeeper'
};

const OUTCOME_TONE: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  meeting_booked: 'default',
  interested: 'default',
  callback_scheduled: 'secondary',
  follow_up: 'secondary',
  no_answer: 'outline',
  voicemail: 'outline',
  not_interested: 'destructive'
};

const DISPOSITIONS: {
  value: string;
  label: string;
  tone: 'positive' | 'neutral' | 'negative';
}[] = [
  { value: 'meeting_booked', label: 'Meeting booked', tone: 'positive' },
  { value: 'sale', label: 'Sale', tone: 'positive' },
  { value: 'interested', label: 'Interested', tone: 'positive' },
  { value: 'follow_up', label: 'Follow up', tone: 'neutral' },
  { value: 'callback_scheduled', label: 'Callback scheduled', tone: 'neutral' },
  { value: 'not_interested', label: 'Not interested', tone: 'negative' },
  { value: 'no_answer', label: 'No answer', tone: 'neutral' },
  { value: 'voicemail', label: 'Voicemail', tone: 'neutral' }
];

type Phase = 'preview' | 'dialing' | 'in_call' | 'wrap_up' | 'completed';

/** A scripted timeline: 4 phases per contact, then a final "completed" frame. */
const PHASE_DURATIONS: Record<string, number> = {
  preview: 1700,
  dialing: 1700,
  in_call: 2700,
  wrap_up: 2000
};
const PHASE_SEQUENCE: { phase: Phase; ms: number }[] = (
  ['preview', 'dialing', 'in_call', 'wrap_up'] as Phase[]
).map((phase) => ({ phase, ms: PHASE_DURATIONS[phase] }));

const TIMELINE: { idx: number; phase: Phase }[] = [
  ...QUEUE.flatMap((_, idx) =>
    PHASE_SEQUENCE.map((f) => ({ idx, phase: f.phase }))
  ),
  { idx: QUEUE.length, phase: 'completed' as Phase }
];

const DURATIONS: number[] = [
  ...QUEUE.flatMap(() => PHASE_SEQUENCE.map((f) => f.ms)),
  2800
];

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Workspace                                                           */
/* ------------------------------------------------------------------ */

export function MockCampaignWorkspace() {
  const [ref, inView] = useInViewRef<HTMLDivElement>(0.25);
  const frame = useStepLoop(TIMELINE.length, DURATIONS, inView);
  const { idx, phase } = TIMELINE[frame] ?? TIMELINE[0];
  const completed = phase === 'completed';
  const processed = completed ? QUEUE.length : idx;
  const activeItem = completed ? null : QUEUE[idx];
  const mode: 'preview' | 'progressive' = 'progressive';

  // Phase timer for the softphone display.
  const [sec, setSec] = useState(0);
  useEffect(() => {
    setSec(phase === 'in_call' ? 41 : 0);
    if (phase !== 'in_call' && phase !== 'dialing') return;
    const id = setInterval(() => setSec((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [phase, idx]);

  const positives = QUEUE.slice(0, processed).filter(
    (l) => l.tone === 'positive'
  ).length;
  const contactRate = processed ? Math.round((positives / processed) * 100) : 0;

  return (
    <div
      ref={ref}
      className='border-border/60 bg-background relative flex h-[600px] flex-col overflow-hidden rounded-2xl border shadow-2xl shadow-black/5 dark:shadow-black/40'
    >
      {/* Status bar */}
      <div className='bg-muted/30 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2'>
        <div className='flex items-center gap-4'>
          <div className='flex items-center gap-2'>
            <div className='bg-primary text-primary-foreground flex h-7 w-7 items-center justify-center rounded-md text-sm font-semibold'>
              R
            </div>
            <div className='hidden text-sm font-semibold sm:inline'>
              Q3 Outbound · Webinar follow-up
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <div className={cn('h-2.5 w-2.5 rounded-full', PHASE_DOT[phase])} />
            <span className='text-sm font-medium'>{PHASE_LABEL[phase]}</span>
          </div>
          <div className='text-muted-foreground hidden items-center gap-4 text-sm sm:flex'>
            <span className='flex items-center gap-1'>
              <Layers className='h-3.5 w-3.5' />
              {processed} / {QUEUE.length}
            </span>
            <span className='flex items-center gap-1'>
              <PhoneCall className='h-3.5 w-3.5' />
              {QUEUE.length - processed} pending
            </span>
            <span className='flex items-center gap-1'>
              <ShieldCheck className='h-3.5 w-3.5' />
              {contactRate}% positive
            </span>
          </div>
        </div>

        <div className='flex items-center gap-2'>
          <div className='bg-background hidden items-center rounded-md border p-0.5 text-xs sm:flex'>
            <span className='text-muted-foreground rounded-sm px-2.5 py-1'>
              Preview
            </span>
            <span className='bg-primary text-primary-foreground flex items-center gap-1 rounded-sm px-2.5 py-1 font-medium'>
              <Zap className='h-3 w-3' /> Progressive
            </span>
          </div>
          <Badge variant='outline' className='gap-1'>
            <span className='h-2 w-2 rounded-full bg-green-500' />
            Line registered
          </Badge>
          <Badge variant='secondary' className='gap-1'>
            <Wallet className='h-3 w-3' />
            $42.80
          </Badge>
          <Badge variant='secondary' className='gap-1'>
            <Clock className='h-3 w-3' />
            6d left
          </Badge>
        </div>
      </div>

      {/* 3 columns */}
      <div className='grid flex-1 grid-cols-1 overflow-y-auto md:grid-cols-3 md:overflow-hidden'>
        <div className='overflow-y-auto border-r'>
          <LeadPanel
            idx={idx}
            phase={phase}
            activeItem={activeItem}
            mode={mode}
          />
        </div>
        <div className='flex items-center justify-center border-r'>
          <Softphone phase={phase} activeItem={activeItem} sec={sec} />
        </div>
        <div className='overflow-y-auto'>
          <DispositionPanel phase={phase} activeItem={activeItem} />
        </div>
      </div>

      {/* Footer */}
      <footer className='bg-muted/30 text-muted-foreground border-t px-4 py-2 text-center text-[11px]'>
        Powered by Ringee — calls placed in-browser via Telnyx WebRTC. Mode:{' '}
        <span className='text-foreground font-semibold'>progressive</span>{' '}
        dialer · Outcomes sync automatically to the owner&apos;s Ringee account.
      </footer>
    </div>
  );
}

const PHASE_LABEL: Record<Phase, string> = {
  preview: 'Ready',
  dialing: 'Dialing',
  in_call: 'In Call',
  wrap_up: 'Wrap Up',
  completed: 'Completed'
};
const PHASE_DOT: Record<Phase, string> = {
  preview: 'bg-green-500',
  dialing: 'bg-orange-500',
  in_call: 'bg-red-500',
  wrap_up: 'bg-purple-500',
  completed: 'bg-gray-400'
};

/* ----------------------------- lead panel ----------------------------- */

function statusOf(
  i: number,
  idx: number,
  phase: Phase
): 'pending' | 'calling' | 'completed' {
  if (phase === 'completed' || i < idx) return 'completed';
  if (i > idx) return 'pending';
  return phase === 'preview' ? 'pending' : 'calling';
}

function LeadPanel({
  idx,
  phase,
  activeItem,
  mode
}: {
  idx: number;
  phase: Phase;
  activeItem: Lead | null;
  mode: string;
}) {
  return (
    <div className='flex h-full flex-col'>
      {activeItem ? (
        <div className='space-y-3 p-4'>
          <div className='flex items-center gap-3'>
            <div className='bg-primary text-primary-foreground flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold'>
              {activeItem.name.charAt(0)}
            </div>
            <div className='min-w-0'>
              <h2 className='truncate text-lg font-semibold'>
                {activeItem.name}
              </h2>
              <Badge variant='secondary' className='text-xs capitalize'>
                {phase.replace('_', ' ')}
              </Badge>
            </div>
          </div>
          <div className='space-y-2 text-sm'>
            <div className='text-muted-foreground flex items-center gap-2'>
              <Phone className='h-4 w-4' />
              <span className='font-mono'>{activeItem.phone}</span>
            </div>
            <div className='text-muted-foreground flex items-center gap-2'>
              <Building2 className='h-4 w-4' />
              <span>{activeItem.company}</span>
            </div>
            <div className='text-muted-foreground flex items-center gap-2'>
              <Hash className='h-4 w-4' />
              <span>Position #{idx + 1}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className='text-muted-foreground p-4 text-center text-sm'>
          Campaign complete — every contact processed.
        </div>
      )}

      <Separator />

      <div className='flex-1 overflow-y-auto p-2'>
        <div className='text-muted-foreground px-2 pb-2 text-xs font-semibold tracking-wide uppercase'>
          Queue · {mode}
        </div>
        <ul className='space-y-1'>
          {QUEUE.map((item, i) => {
            const st = statusOf(i, idx, phase);
            const isActive = i === idx && phase !== 'completed';
            const Icon =
              st === 'completed'
                ? CheckCircle2
                : st === 'calling'
                  ? Phone
                  : Hash;
            return (
              <li key={item.name}>
                <div
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 ring-primary/30 ring-1'
                      : 'opacity-90'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      st === 'calling'
                        ? 'animate-pulse text-orange-500'
                        : st === 'completed'
                          ? 'text-emerald-600'
                          : 'text-muted-foreground'
                    )}
                  />
                  <div className='min-w-0 flex-1'>
                    <div className='truncate font-medium'>{item.name}</div>
                    <div className='text-muted-foreground truncate text-xs'>
                      {item.company} · {item.phone}
                    </div>
                  </div>
                  {st === 'completed' && (
                    <Badge
                      variant={OUTCOME_TONE[item.outcome] ?? 'outline'}
                      className='ml-auto text-[10px] whitespace-nowrap'
                    >
                      {OUTCOME_LABELS[item.outcome] ?? item.outcome}
                    </Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ----------------------------- softphone ----------------------------- */

function Softphone({
  phase,
  activeItem,
  sec
}: {
  phase: Phase;
  activeItem: Lead | null;
  sec: number;
}) {
  if (phase === 'completed') {
    return (
      <div className='flex flex-col items-center justify-center gap-4 p-8 text-center'>
        <CheckCircle2 className='h-16 w-16 text-emerald-500' />
        <div>
          <h2 className='text-xl font-semibold'>All calls completed</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            Every contact in this session has been processed.
          </p>
        </div>
      </div>
    );
  }
  if (!activeItem) return null;

  if (phase === 'preview') {
    return (
      <div className='flex flex-col items-center justify-center gap-6 p-8'>
        <div className='text-center'>
          <div className='text-muted-foreground text-xs tracking-wide uppercase'>
            Progressive dialer
          </div>
          <p className='mt-2 text-2xl font-semibold'>{activeItem.name}</p>
          <p className='text-muted-foreground text-sm'>{activeItem.company}</p>
          <p className='text-muted-foreground mt-2 font-mono text-sm'>
            {activeItem.phone}
          </p>
        </div>
        <div className='flex gap-3'>
          <Button size='lg' className='pointer-events-none'>
            <Phone className='mr-2 h-5 w-5' /> Dial
          </Button>
          <Button variant='outline' size='lg' className='pointer-events-none'>
            <SkipForward className='mr-2 h-5 w-5' /> Skip
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'dialing') {
    return (
      <div className='flex flex-col items-center justify-center gap-5 p-8'>
        <div className='text-center'>
          <Loader2 className='mx-auto h-10 w-10 animate-spin text-orange-500' />
          <p className='mt-3 text-lg font-semibold'>Ringing…</p>
          <p className='text-muted-foreground text-sm'>
            {activeItem.name} · {activeItem.phone}
          </p>
          <p className='mt-3 font-mono text-2xl text-orange-500 tabular-nums'>
            {fmt(sec)}
          </p>
        </div>
        <Button
          variant='destructive'
          size='lg'
          className='pointer-events-none h-14 w-14 rounded-full'
        >
          <PhoneOff className='h-6 w-6' />
        </Button>
      </div>
    );
  }

  if (phase === 'in_call') {
    return (
      <div className='flex flex-col items-center justify-center gap-6 p-8'>
        <div className='text-center'>
          <div className='text-xs tracking-wide text-red-500 uppercase'>
            In call
          </div>
          <p className='mt-2 text-xl font-semibold'>{activeItem.name}</p>
          <p className='text-muted-foreground text-sm'>{activeItem.phone}</p>
          <p className='mt-3 font-mono text-4xl font-bold tabular-nums'>
            {fmt(sec)}
          </p>
          <div className='mt-1 flex items-center justify-center gap-1 text-xs text-red-500'>
            <Circle className='h-2 w-2 fill-red-500' /> Recording
          </div>
        </div>
        <div className='flex items-center gap-3'>
          {[Mic, Pause, Circle, Grid3X3].map((Icon, i) => (
            <Button
              key={i}
              variant='outline'
              size='icon'
              className='pointer-events-none h-12 w-12 rounded-full'
            >
              <Icon className='h-5 w-5' />
            </Button>
          ))}
        </div>
        <Button
          variant='destructive'
          size='lg'
          className='pointer-events-none h-14 w-14 rounded-full'
        >
          <PhoneOff className='h-6 w-6' />
        </Button>
      </div>
    );
  }

  // wrap_up
  return (
    <div className='flex flex-col items-center justify-center gap-4 p-8 text-center'>
      <div className='text-xs tracking-wide text-purple-600 uppercase'>
        Wrap up
      </div>
      <p className='text-lg font-semibold'>Call ended</p>
      <p className='text-muted-foreground text-sm'>
        Recording the outcome on the right, then auto-dialing the next contact.
      </p>
    </div>
  );
}

/* --------------------------- disposition panel --------------------------- */

function DispositionPanel({
  phase,
  activeItem
}: {
  phase: Phase;
  activeItem: Lead | null;
}) {
  if (phase !== 'wrap_up' || !activeItem) {
    return (
      <div className='flex h-full flex-col items-center justify-center p-6 text-center'>
        <ClipboardList className='text-muted-foreground mb-3 h-10 w-10' />
        <h3 className='font-semibold'>Disposition</h3>
        <p className='text-muted-foreground mt-1 text-sm'>
          {phase === 'completed'
            ? 'Session is complete — nothing more to record.'
            : phase === 'preview'
              ? 'Select a call outcome after each call.'
              : 'Disposition will be available after the call ends.'}
        </p>
      </div>
    );
  }

  return (
    <div className='flex h-full flex-col p-4'>
      <h3 className='mb-1 text-sm font-semibold'>Select disposition</h3>
      <p className='text-muted-foreground mb-3 text-xs'>
        Outcome is required before continuing to the next contact.
      </p>
      <div className='grid grid-cols-2 gap-2'>
        {DISPOSITIONS.map((o) => {
          const selected = o.value === activeItem.outcome;
          const tone =
            o.tone === 'positive'
              ? selected
                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                : 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
              : o.tone === 'negative'
                ? selected
                  ? 'bg-red-600 text-white border-red-600'
                  : 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-300'
                : selected
                  ? 'bg-foreground text-background border-foreground'
                  : '';
          return (
            <motion.div
              key={o.value}
              animate={selected ? { scale: [1, 1.04, 1] } : {}}
              transition={{ duration: 0.5 }}
            >
              <Button
                variant={selected ? 'default' : 'outline'}
                size='sm'
                className={cn('pointer-events-none w-full justify-start', tone)}
              >
                {o.label}
              </Button>
            </motion.div>
          );
        })}
      </div>

      <Separator className='my-4' />

      <div className='space-y-1'>
        <p className='text-xs font-medium'>Notes</p>
        <div className='bg-muted/30 text-muted-foreground min-h-[64px] rounded-md border px-3 py-2 text-sm'>
          {NOTE_FOR[activeItem.outcome] ??
            'Logged automatically from the call.'}
        </div>
      </div>

      <div className='mt-auto flex flex-col gap-2 pt-4'>
        <Button className='pointer-events-none'>
          Save outcome &amp; continue
        </Button>
        <Button variant='outline' className='pointer-events-none'>
          Save outcome &amp; stop
        </Button>
      </div>
    </div>
  );
}

const NOTE_FOR: Record<string, string> = {
  interested: 'Strong fit — wants a tailored demo. Budget confirmed.',
  meeting_booked: 'Booked Thursday 2 PM, 30 min. Sent calendar invite.',
  callback_scheduled: 'Asked to call back tomorrow morning.',
  no_answer: 'No answer — will retry this afternoon.',
  voicemail: 'Left a voicemail referencing the webinar.'
};
