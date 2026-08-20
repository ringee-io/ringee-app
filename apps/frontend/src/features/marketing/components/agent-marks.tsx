'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { cn } from '@ringee/frontend-shared/lib/utils';

import {
  ChatGptLogo,
  ClaudeLogo,
  HermesLogo,
  OpenClawLogo
} from './agent-logos';

/**
 * The vendor marks, wherever the marketing pages name *who* drives Ringee.
 *
 * A logomark on its own is a guessing game — half of these are recognisable
 * only to the people who already use them — so every mark carries its name in a
 * tooltip instead of a bare `title` attribute, which never shows on touch and
 * is styled by the OS rather than by us.
 *
 * The list lives here rather than in the section that first used it, because
 * the hero and the agentic-mode section have to name the same four agents in
 * the same order.
 */

export type Mark = {
  name: string;
  logo: (props: { className?: string }) => React.JSX.Element;
};

export const AGENT_MARKS: Mark[] = [
  { name: 'ChatGPT', logo: ChatGptLogo },
  { name: 'Claude', logo: ClaudeLogo },
  { name: 'OpenClaw', logo: OpenClawLogo },
  { name: 'Hermes', logo: HermesLogo }
];

/** One mark: the logo, its name on hover, and its name for screen readers. */
export function MarkIcon({
  mark,
  className,
  wrapperClassName
}: {
  mark: Mark;
  className?: string;
  wrapperClassName?: string;
}) {
  const MarkLogo = mark.logo;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role='img'
          aria-label={mark.name}
          tabIndex={0}
          className={cn(
            'inline-flex items-center focus-visible:outline-none',
            wrapperClassName
          )}
        >
          <MarkLogo className={cn('h-[22px] w-[22px]', className)} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{mark.name}</TooltipContent>
    </Tooltip>
  );
}

/**
 * "Runs from ⟨marks⟩ + any MCP client, or the CLI" — the one line that says
 * Ringee is driven by the AI you already have open. Rendered in the hero and
 * again under the loop, so it is a component rather than a copied row.
 */
export function RunsFrom({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-3', className)}
    >
      <span className='text-muted-foreground font-mono text-[11px] tracking-widest uppercase'>
        Runs from
      </span>
      <div className='flex items-center gap-4'>
        {AGENT_MARKS.map((mark) => (
          <MarkIcon
            key={mark.name}
            mark={mark}
            className='h-5 w-5'
            wrapperClassName='text-muted-foreground/70 hover:text-foreground transition-colors duration-200'
          />
        ))}
      </div>
      <span className='text-muted-foreground text-xs'>
        + any MCP client, or the CLI
      </span>
    </div>
  );
}
