import Image from 'next/image';
import { AudioLines, FileText, History, ListChecks, Phone } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';

/**
 * The hero visual: two operators, one stack.
 *
 * Ringee's whole positioning is that a teammate and an AI voice agent are two
 * entrances to the same calling infrastructure. The previous version of this
 * component argued that with boxes and lucide glyphs, and it read like a
 * diagram of the product rather than the product. This one leads with a real
 * 3D render — a rep on a headset and a voice agent, modelled, lit and shot as
 * a single scene (three.js; the scene source and the render recipe are in
 * `docs/engineering/MARKETING_VISUALS.md`) — and keeps the structure
 * underneath it: the stack they both dial through, and the record they both
 * write into.
 *
 * Three things to know before editing:
 *
 * 1. **The panel is ink in both themes.** The render is lit like a product
 *    shot — emerald under the stack, sky on the human, violet on the agent —
 *    and that lighting only holds on a dark ground. On the light marketing
 *    pages it becomes the focal object, which is a hero visual's job.
 * 2. **It ships no JavaScript.** The float, the glow, the waveforms and the
 *    pointer parallax are CSS (`ringee-stage` in `globals.css`), so the hero
 *    stays a server component.
 * 3. **The HUD is real text.** Everything a reader needs — who is calling,
 *    from where, into what — is markup over the render, not baked into the
 *    image, so it stays legible, translatable and indexable.
 *
 * Used by the home hero and the AI voice-agent page hero.
 */

/**
 * The render, at 2x the widest column the panel ever gets. The intrinsic size
 * has to match the file — `render.sh` prints it, and a stale number here
 * stretches the figures. See docs/engineering/MARKETING_VISUALS.md.
 */
const RENDER = {
  src: '/hero/human-ai-operators.webp',
  width: 1360,
  height: 940
};

/** What both operators write into, once the call ends. */
const SHARED_CAPABILITIES = [
  { label: 'Phone numbers', icon: Phone },
  { label: 'Call history', icon: History },
  { label: 'Recordings', icon: AudioLines },
  { label: 'Outcomes', icon: ListChecks }
];

/**
 * What the stack does for either caller. Named after the services that
 * actually run it (`CallerIdRotationService`, the recording + transcription
 * pipeline) — nothing here is invented for the picture.
 */
const STACK_MODULES = [
  'Carrier routing',
  'Caller-ID rotation',
  'Recording + transcripts'
];

/** Bar heights, fixed rather than random: the markup is server-rendered. */
const HUMAN_WAVE = [30, 58, 88, 46, 72, 34, 64, 92, 40, 56];
const AGENT_WAVE = [44, 74, 96, 38, 60, 86, 32, 68, 50, 80];

function Waveform({
  bars,
  className,
  phase = 0
}: {
  bars: number[];
  className: string;
  phase?: number;
}) {
  return (
    <span aria-hidden className='flex h-3.5 items-center gap-[2px]'>
      {bars.map((height, index) => (
        <span
          key={`${index}-${height}`}
          className={cn(
            'ringee-stage__bar w-[2px] min-w-[2px] rounded-full',
            className
          )}
          style={{
            height: `${height}%`,
            animationDelay: `${(phase + index * 0.08).toFixed(2)}s`,
            animationDuration: `${(0.9 + (index % 3) * 0.14).toFixed(2)}s`
          }}
        />
      ))}
    </span>
  );
}

/**
 * One operator's HUD card, pinned to its half of the render: who is calling,
 * what they are doing right now, and every surface they can dial from.
 * Anchored at the bottom rather than over the heads — a label across a face is
 * the fastest way to make a good render look like a stock photo with a sticker
 * on it.
 */
function OperatorCard({
  className,
  accent,
  role,
  status,
  channels,
  bars,
  barClassName,
  phase
}: {
  className?: string;
  accent: string;
  role: string;
  status: string;
  channels: string;
  bars: number[];
  barClassName: string;
  phase: number;
}) {
  return (
    <div
      className={cn(
        'absolute bottom-2.5 z-20 w-[46%] rounded-xl border border-white/12 bg-slate-950/70 px-2 py-1.5 backdrop-blur-md sm:bottom-3',
        className
      )}
    >
      <div className='flex items-center justify-between gap-2'>
        <p className='flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-white'>
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', accent)} />
          <span className='truncate'>{role}</span>
        </p>
        <span className='hidden shrink-0 sm:block'>
          <Waveform bars={bars} className={barClassName} phase={phase} />
        </span>
      </div>
      <p className='mt-1 truncate text-[10px] leading-tight text-white/55'>
        {status}
      </p>
      <p className='truncate text-[10px] leading-tight text-white/40'>
        {channels}
      </p>
    </div>
  );
}

/** The light one operator's call sends down into the stack. */
function Beam({
  gradient,
  packet,
  delay
}: {
  gradient: string;
  packet: string;
  delay: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative block h-7 w-px overflow-hidden bg-gradient-to-b',
        gradient
      )}
    >
      <span
        className={cn(
          'ringee-stage__packet absolute inset-x-[-1px] top-0 h-2 rounded-full',
          packet
        )}
        style={{ animationDelay: delay }}
      />
    </span>
  );
}

export function HumanAiCallingVisual({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'ringee-stage relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-[#060a13] p-3 shadow-[0_60px_140px_-50px_rgba(2,6,23,0.85)] ring-1 ring-black/5 sm:p-4 dark:ring-white/5',
        className
      )}
    >
      {/* Room light: a cool wash from above, one warm-cool spot per operator,
          and emerald bounce off the stack at the bottom. */}
      <div
        aria-hidden
        className='absolute inset-0 -z-10 bg-[radial-gradient(130%_95%_at_50%_-20%,#18273f_0%,#0a1120_46%,#04070e_100%)]'
      />
      <div
        aria-hidden
        className='absolute inset-0 -z-10 bg-[radial-gradient(42%_32%_at_20%_16%,rgba(56,189,248,0.22),transparent_70%),radial-gradient(42%_32%_at_80%_16%,rgba(167,139,250,0.24),transparent_70%),radial-gradient(70%_40%_at_50%_104%,rgba(16,185,129,0.22),transparent_72%)]'
      />

      <div className='flex items-start justify-between gap-4 px-1.5 pt-1'>
        <div>
          <p className='text-[13px] font-semibold tracking-tight text-white'>
            Ringee calling infrastructure
          </p>
          <p className='mt-0.5 text-[11px] text-white/50'>
            One stack. Two ways to call.
          </p>
        </div>
        <span className='inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200'>
          <span className='ringee-pulse h-1.5 w-1.5 rounded-full bg-emerald-400' />
          Live
        </span>
      </div>

      {/* The render, in its studio. */}
      <div className='ringee-stage__frame relative mt-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-[radial-gradient(120%_80%_at_50%_10%,#132036_0%,#080d18_60%,#05080f_100%)]'>
        <div
          aria-hidden
          className='ringee-stage__glow absolute inset-x-[12%] top-[6%] bottom-[22%] -z-0 rounded-full bg-[radial-gradient(closest-side,rgba(94,234,212,0.18),transparent_75%)] blur-2xl'
        />
        <div
          aria-hidden
          className='absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.055)_1px,transparent_0)] [mask-image:radial-gradient(70%_60%_at_50%_40%,black,transparent)] [background-size:18px_18px]'
        />

        <Image
          src={RENDER.src}
          width={RENDER.width}
          height={RENDER.height}
          alt='A Ringee teammate on a headset and a Ringee AI voice agent, standing on the same calling stack'
          priority
          sizes='(min-width: 1024px) 560px, 92vw'
          className='ringee-stage__render relative z-10 w-full'
        />

        {/* The floor the render is cropped just above, continued in CSS so the
            figures stand on something instead of ending at the frame edge. */}
        <div
          aria-hidden
          className='absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-[#05080f] via-[#05080f]/90 to-transparent'
        />
        <div
          aria-hidden
          className='absolute inset-x-[14%] bottom-[22%] z-10 h-px bg-gradient-to-r from-transparent via-emerald-300/45 to-transparent'
        />

        <OperatorCard
          className='left-2.5 sm:left-3'
          accent='bg-sky-400'
          role='Human agent'
          status='On a call · 02:14'
          channels='Browser · Mobile · Extension · SDK'
          bars={HUMAN_WAVE}
          barClassName='bg-sky-300/90'
          phase={0}
        />
        <OperatorCard
          className='right-2.5 sm:right-3'
          accent='bg-violet-400'
          role='AI voice agent'
          status='Speaking · 00:47'
          channels='Dashboard · API · MCP · CLI'
          bars={AGENT_WAVE}
          barClassName='bg-violet-300/90'
          phase={0.3}
        />
      </div>

      {/* Both calls land on the same stack… */}
      <div className='mt-1.5 flex justify-center gap-[42%]'>
        <Beam
          gradient='from-sky-400/70 via-sky-400/40 to-transparent'
          packet='bg-sky-200 shadow-[0_0_10px_2px_rgba(125,211,252,0.75)]'
          delay='0s'
        />
        <Beam
          gradient='from-violet-400/70 via-violet-400/40 to-transparent'
          packet='bg-violet-200 shadow-[0_0_10px_2px_rgba(196,181,253,0.75)]'
          delay='1.5s'
        />
      </div>

      <div className='relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2.5 shadow-[0_18px_40px_-24px_rgba(16,185,129,0.6),inset_0_1px_0_0_rgba(255,255,255,0.08)]'>
        <span
          aria-hidden
          className='ringee-stage__sweep pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/12 to-transparent'
        />
        <div className='relative flex items-center justify-between gap-3'>
          <div className='min-w-0'>
            <p className='text-[12px] font-semibold text-white'>
              One calling stack
            </p>
            <p className='mt-0.5 truncate text-[10px] text-white/55'>
              {STACK_MODULES.join(' · ')}
            </p>
          </div>
          <span className='shrink-0 rounded-full border border-emerald-400/25 px-2 py-0.5 text-[10px] font-medium text-emerald-200'>
            Open source
          </span>
        </div>
      </div>

      {/* …and both write into the same record. */}
      <div className='mt-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5'>
        <div className='flex items-center gap-1.5'>
          <FileText className='h-3.5 w-3.5 text-emerald-300' aria-hidden />
          <p className='text-[12px] font-semibold text-white'>
            Shared system of record
          </p>
        </div>
        {/* Two columns at every width. Four fits the home panel and truncates
            on the narrower AI voice-agent one, and a clipped label reads as a
            bug rather than as density. */}
        <div className='mt-2 grid grid-cols-2 gap-1.5'>
          {SHARED_CAPABILITIES.map((capability) => (
            <div
              key={capability.label}
              className='flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2 py-1.5 text-[10px] font-medium text-white/65'
            >
              <capability.icon className='h-3 w-3 shrink-0' aria-hidden />
              <span className='truncate'>{capability.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
