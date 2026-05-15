'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  IconArrowRight,
  IconChartBar,
  IconCheck,
  IconLock,
  IconSearch,
  IconSparkles,
  IconTargetArrow
} from '@tabler/icons-react';

const EXAMPLES: Array<{
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  text: string;
}> = [
  {
    icon: IconTargetArrow,
    title: 'Find decision-makers in a specific market',
    text: 'I want to reach Heads of Sales at 50-200 person B2B SaaS companies in France that have an outbound team. Help me build the strongest search and find the top 25 leads.'
  },
  {
    icon: IconChartBar,
    title: 'Lookalike search from my best customers',
    text: 'Analyze my past won deals in Ringee and recommend 2 or 3 lookalike search strategies. Then run the one most likely to convert.'
  },
  {
    icon: IconSearch,
    title: 'Refine a vague target into real filters',
    text: "I want to sell to founders in LATAM with an international outbound sales team. Translate this into concrete filters (titles, industries, country codes, company size) and run the search."
  }
];

const HIGHLIGHTS = [
  'Analyzes your past won deals to infer ICP signals',
  'Recommends concrete, high-converting search filters',
  'Searches Apollo and Prospeo through Ringee internal tools',
  'Scores every prospect with explainable reasons',
  'Reveals email or phone only after you explicitly confirm',
  'Saves selected prospects into Ringee contacts and lists'
];

interface Props {
  providersConnected: string[];
  onPick: (text: string) => void;
  onStartBlank: () => void;
}

export function EmptyState({ providersConnected, onPick, onStartBlank }: Props) {
  const noProviders = providersConnected.length === 0;

  return (
    <div className='flex flex-1 flex-col items-center overflow-y-auto px-6 py-10'>
      <div className='w-full max-w-3xl'>
        <div className='flex flex-col items-center text-center'>
          <div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-sm'>
            <IconSparkles size={26} />
          </div>
          <h1 className='mt-3 text-2xl font-semibold tracking-tight'>
            Prospecting Expert
          </h1>
          <p className='mt-1.5 max-w-lg text-sm text-muted-foreground'>
            Describe who you want to sell to. Ringee AI analyzes your best
            customers, recommends high-converting searches, scores prospects,
            and saves the ones you pick.
          </p>

          <div className='mt-3 flex flex-wrap items-center justify-center gap-1.5'>
            {noProviders ? (
              <Badge variant='outline' className='gap-1.5'>
                <IconLock size={11} /> No prospecting provider connected
              </Badge>
            ) : (
              providersConnected.map((p) => (
                <Badge key={p} variant='secondary' className='gap-1 capitalize'>
                  <IconCheck size={11} /> {p} connected
                </Badge>
              ))
            )}
          </div>
        </div>

        <div className='mt-7 grid gap-2'>
          <div className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
            Start with a goal
          </div>
          {EXAMPLES.map(({ icon: Icon, title, text }) => (
            <button
              key={title}
              type='button'
              onClick={() => onPick(text)}
              className='group flex items-start gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 text-left shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-md'
            >
              <div className='mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                <Icon size={16} />
              </div>
              <div className='flex-1'>
                <div className='text-sm font-semibold'>{title}</div>
                <div className='mt-0.5 text-xs text-muted-foreground line-clamp-2'>
                  {text}
                </div>
              </div>
              <IconArrowRight
                size={16}
                className='mt-2 shrink-0 opacity-0 transition-opacity group-hover:opacity-60'
              />
            </button>
          ))}
        </div>

        <div className='mt-6 flex justify-center'>
          <Button variant='ghost' size='sm' onClick={onStartBlank}>
            Or start with a blank message
          </Button>
        </div>

        <div className='mt-8 rounded-xl border border-dashed border-border/60 bg-muted/30 px-4 py-3'>
          <div className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
            What this agent will do
          </div>
          <ul className='mt-2 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2'>
            {HIGHLIGHTS.map((h) => (
              <li key={h} className='flex items-start gap-1.5'>
                <IconCheck
                  size={12}
                  className='mt-0.5 shrink-0 text-primary'
                />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
