'use client';

import { useState } from 'react';
import { RotateCw } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';

import { WindowDots } from './flow-primitives';
import type { SessionLine, SessionLineKind } from '../content/machine-view';

/**
 * The agent session on `/machine`: the outbound loop replayed as a terminal.
 *
 * Lines are in the initial HTML — a crawler or an agent reads the whole
 * transcript as plain text, the animation is only the order a person reads it
 * in. Each line fades in on its own delay; REPLAY restarts the run by
 * remounting the block, which is all a CSS animation needs.
 *
 * The surface is opaque black in both themes, like `CodeBlock` and the terminal
 * panels in Agentic mode: a terminal does not follow the page theme. Everything
 * around it does.
 */

/** One colour per kind of line. The one human step is deliberately not green. */
const LINE_STYLES: Record<SessionLineKind, string> = {
  cmd: 'text-emerald-300',
  out: 'text-zinc-400',
  ok: 'text-emerald-400',
  tool: 'text-orange-200',
  note: 'text-zinc-500 italic',
  human: 'text-sky-300',
  done: 'text-zinc-400'
};

/** Milliseconds between two lines appearing. */
const STAGGER = 130;

const KEYFRAMES = `
@keyframes ringee-session-line-in { from { opacity: 0 } }
.ringee-session-line { animation: ringee-session-line-in 200ms ease-out backwards }
@media (prefers-reduced-motion: reduce) {
  .ringee-session-line { animation: none }
}
`;

export function AgentSession({
  lines,
  className
}: {
  lines: readonly SessionLine[];
  className?: string;
}) {
  const [run, setRun] = useState(0);

  return (
    <div
      className={cn(
        // `min-w-0` for the same reason `CodeBlock` carries it: inside a flex
        // or grid track a long transcript line widens the page instead of
        // scrolling itself.
        'w-full min-w-0 overflow-hidden rounded-2xl bg-black',
        // A dark panel on a light page needs the lift; on a dark page the hair
        // line does the work. Same treatment as the hero screenshot.
        'shadow-2xl ring-1 shadow-black/10 ring-black/5 dark:shadow-black/40 dark:ring-white/10',
        className
      )}
    >
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <div className='flex items-center gap-3 border-b border-white/10 px-5 py-3.5 sm:px-6'>
        <WindowDots onDark />
        <span className='font-mono text-[11px] tracking-widest text-zinc-500 uppercase'>
          Agent session
        </span>
        <button
          type='button'
          onClick={() => setRun((current) => current + 1)}
          className='ml-auto flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] tracking-widest text-zinc-400 uppercase transition-colors hover:bg-white/5 hover:text-zinc-100'
        >
          <RotateCw className='h-3 w-3' aria-hidden />
          Replay
        </button>
      </div>
      <div
        role='region'
        aria-label='Agent session replay'
        tabIndex={0}
        className='overflow-x-auto px-5 py-5 sm:px-6 sm:py-6'
      >
        <pre key={run} className='font-mono text-[13px] leading-6 sm:text-sm'>
          <code>
            {lines.map((line, index) => (
              <span
                key={`${line.text}-${index}`}
                className={cn(
                  'ringee-session-line block',
                  LINE_STYLES[line.kind]
                )}
                style={{ animationDelay: `${index * STAGGER}ms` }}
              >
                {line.text}
                {'\n'}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
