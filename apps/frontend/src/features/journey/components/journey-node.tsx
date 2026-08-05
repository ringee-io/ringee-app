'use client';

import { forwardRef } from 'react';
import { IconCheck, IconLock } from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useJourneyCopy } from '../lib/copy';
import { nodeIcon, trackPresentation } from '../lib/presentation';
import type { JourneyNode } from '../types';

/**
 * One node of the map.
 *
 * A real `<button>`, not a div with a click handler: it is in the tab order, it
 * announces its own state, and it works with a screen reader without any ARIA
 * gymnastics. The SVG thread layer behind it is `pointer-events-none`, so
 * nothing competes with it for the click.
 *
 * Content is centred rather than corner-anchored, because on a radial map a
 * node is approached from any direction — a left-aligned label reads as
 * misaligned everywhere except due east.
 *
 * Five states, each distinguishable **without colour**:
 *
 * - completed  — filled, check glyph
 * - in progress— track-tinted icon plus a progress bar
 * - available  — plain card
 * - locked     — muted, lock glyph, reduced opacity
 * - optional   — hexagonal rather than rounded, plus an explicit "Optional"
 *                label and an accessible description. Shape alone would fail
 *                for anyone who cannot see it, so the label is not decoration.
 *
 * The reward is shown as **money**, not as a star: the amount is the single
 * most motivating thing a node can say, and a star made every rewarded node
 * look identical to every other one.
 *
 * The box size is whatever the graph hands down in `style` — never a constant
 * read back from the layout module, or the two would drift apart the moment the
 * canvas renders at a different size. `compact` only scales the chrome inside.
 */
export const JourneyGraphNode = forwardRef<
  HTMLButtonElement,
  {
    node: JourneyNode;
    /**
     * Resolved by the caller. A map node is a *thread*, so its name comes from
     * the track copy, and looking it up here from the node id would silently
     * render the raw id.
     */
    label: string;
    /** Small line under the money, e.g. "2 of 5 steps". */
    caption?: string | null;
    /** Screen-reader sentence for the whole node. */
    ariaLabel: string;
    selected: boolean;
    recommended: boolean;
    /** Pre-formatted by the caller, which owns the locale. */
    rewardLabel: string | null;
    /** The canvas is rendering at its narrow size; scale the chrome to match. */
    compact?: boolean;
    onSelect: (nodeId: string) => void;
    onFocus?: (nodeId: string) => void;
    style?: React.CSSProperties;
    /**
     * `data-node-id` is read by the graph's keyboard handler to identify which
     * node the event came from, so the arrow-key mapping can live in one place
     * instead of being duplicated on every node.
     */
    'data-node-id'?: string;
    /** Set on the first node of a thread: the track bar scrolls to it. */
    'data-track-anchor'?: string;
  }
>(function JourneyGraphNode(
  {
    node,
    label,
    caption,
    ariaLabel,
    selected,
    recommended,
    rewardLabel,
    compact = false,
    onSelect,
    onFocus,
    style,
    ...rest
  },
  ref
) {
  const { t } = useJourneyCopy();
  const track = trackPresentation(node.track);
  const Icon = nodeIcon(node.id, node.track);

  const achieved = node.status === 'achieved';
  const locked = node.status === 'locked';
  const inProgress = node.status === 'in_progress';

  return (
    <button
      {...rest}
      ref={ref}
      type='button'
      style={style}
      onClick={() => onSelect(node.id)}
      onFocus={() => onFocus?.(node.id)}
      aria-current={selected ? 'true' : undefined}
      aria-describedby={
        node.optional ? `journey-optional-${node.id}` : undefined
      }
      aria-label={ariaLabel}
      className={cn(
        'group absolute flex flex-col items-center justify-center overflow-hidden text-center transition-all duration-200',
        'focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        // Hexagon marks a bonus node; the label below carries the same meaning
        // for anyone who cannot perceive the shape. The point is a shallow 12%
        // and the padding clears it — a deeper bevel ate the icon's corner.
        node.optional
          ? cn(
              '[clip-path:polygon(50%_0%,100%_12%,100%_88%,50%_100%,0%_88%,0%_12%)]',
              compact ? 'px-2.5 py-3' : 'px-3 py-3.5'
            )
          : cn('rounded-2xl', compact ? 'p-2' : 'p-2.5'),
        achieved
          ? cn(track.fill, 'text-white shadow-sm')
          : locked
            ? 'bg-muted/40 text-muted-foreground border-border border border-dashed opacity-70'
            : cn(
                'bg-card border shadow-sm',
                selected ? `ring-2 ${track.ring}` : 'border-border',
                'hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0'
              ),
        // The single recommended node is the only thing on the page that moves
        // at rest. More than one pulsing element reads as noise.
        recommended &&
          !achieved &&
          !locked &&
          'ring-offset-background animate-[journey-pulse_3s_ease-in-out_infinite] ring-2 ring-offset-2 motion-reduce:animate-none',
        recommended && !achieved && !locked && track.ring
      )}
    >
      <span
        aria-hidden='true'
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full',
          compact ? 'size-7' : 'size-8',
          achieved ? 'bg-white/20' : locked ? 'bg-muted' : track.tint
        )}
      >
        {achieved ? (
          <IconCheck
            className={cn('text-white', compact ? 'size-4' : 'size-[18px]')}
            stroke={2.5}
          />
        ) : locked ? (
          <IconLock className={compact ? 'size-3.5' : 'size-4'} />
        ) : (
          <Icon
            className={cn(compact ? 'size-4' : 'size-[18px]', track.accent)}
          />
        )}
      </span>

      {/*
        Two lines, not one truncated one. A third of the node names do not fit
        on a single line at this width in either language, and "Multi-capabil…"
        is not a step anyone can recognise.
      */}
      <p
        className={cn(
          'mt-1.5 line-clamp-2 font-semibold',
          compact ? 'text-[10px] leading-[1.25]' : 'text-[11px] leading-tight'
        )}
        title={label}
      >
        {label}
      </p>

      {/* The money, when there is money and it has not been paid yet. */}
      {rewardLabel && !achieved && (
        <span
          className={cn(
            'mt-1 text-[11px] leading-none font-semibold tabular-nums',
            locked ? 'text-muted-foreground/70' : track.accent
          )}
        >
          {rewardLabel}
        </span>
      )}

      {caption && (
        <span
          className={cn(
            'mt-1 text-[9px] leading-none tabular-nums',
            achieved ? 'text-white/80' : 'text-muted-foreground'
          )}
        >
          {caption}
        </span>
      )}

      {node.optional && (
        <span
          id={`journey-optional-${node.id}`}
          className={cn(
            'mt-0.5 text-[9px] leading-tight font-medium',
            achieved ? 'text-white/80' : 'text-muted-foreground'
          )}
        >
          {t('status.optional')}
        </span>
      )}

      {inProgress && (
        <div
          role='progressbar'
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={node.progressPct}
          aria-label={t('progress.nodeProgress', { percent: node.progressPct })}
          className={cn(
            'bg-muted mt-1.5 h-1 overflow-hidden rounded-full',
            compact ? 'w-10' : 'w-12'
          )}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none',
              track.fill
            )}
            style={{ width: `${node.progressPct}%` }}
          />
        </div>
      )}
    </button>
  );
});
