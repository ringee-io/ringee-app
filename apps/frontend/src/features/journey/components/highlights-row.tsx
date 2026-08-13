import {
  IconTrendingDown,
  IconTrendingUp,
  IconMinus
} from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Panel } from './primitives';
import type { JourneyHighlight } from '../lib/journey';

/**
 * The KPI row. Four hero numbers, no plot — for a single headline value a stat
 * tile beats a chart. Trend is carried by an icon *and* a signed number, never
 * by colour alone.
 */
export function HighlightsRow({
  highlights
}: {
  highlights: JourneyHighlight[];
}) {
  return (
    <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
      {highlights.map((item) => {
        const Icon = item.Icon;
        return (
          <Panel key={item.id} className='p-4'>
            <div className='flex items-start justify-between gap-2'>
              <p className='text-muted-foreground text-xs font-medium'>
                {item.label}
              </p>
              <Icon className='text-muted-foreground/50 size-4 shrink-0' />
            </div>
            <p className='mt-2 text-2xl font-semibold tracking-tight tabular-nums'>
              {item.value}
            </p>
            <div className='mt-1 flex items-center gap-2'>
              {item.hint ? (
                <span className='text-muted-foreground truncate text-[11px]'>
                  {item.hint}
                </span>
              ) : null}
              {typeof item.trendPct === 'number' ? (
                <Trend value={item.trendPct} />
              ) : null}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function Trend({ value }: { value: number }) {
  const Icon =
    value > 0 ? IconTrendingUp : value < 0 ? IconTrendingDown : IconMinus;

  return (
    <span
      className={cn(
        'ml-auto inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium tabular-nums',
        value > 0
          ? 'text-emerald-600 dark:text-emerald-400'
          : value < 0
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-muted-foreground'
      )}
      title='Compared with the previous 30 days'
    >
      <Icon className='size-3.5' />
      {value > 0 ? '+' : ''}
      {value}%
    </span>
  );
}
