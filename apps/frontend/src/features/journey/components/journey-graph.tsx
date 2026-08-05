'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useLocale } from 'next-intl';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useJourneyCopy } from '../lib/copy';
import { formatCents, trackPresentation } from '../lib/presentation';
import {
  COMFORTABLE_METRICS,
  COMPACT_METRICS,
  buildGraphLayout,
  graphNeighbours
} from '../lib/graph-layout';
import { JourneyGraphNode } from './journey-node';
import { JourneyHub } from './journey-hub';
import type { JourneyThread } from '../lib/threads';
import type { JourneyOverview } from '../types';

/** Below this much room for the map, the nodes render at their narrow size. */
const COMPACT_BELOW = 560;

/**
 * The map.
 *
 * The workspace sits in the middle and every track leaves it as a thread. Plain
 * CSS positioning for the nodes plus one absolutely-positioned SVG layer for the
 * threads — deliberately not a canvas library: this graph is authored and
 * read-only, so pan/zoom/physics would add weight and take the nodes out of the
 * tab order for nothing. Positions come from `buildGraphLayout`, which is pure,
 * so the server and the client render the same picture.
 *
 * The SVG is `pointer-events-none` and `aria-hidden`: threads are a visual
 * restatement of `dependsOn`, which the drawer already lists as text and which
 * every node announces. Letting them absorb clicks or screen-reader focus would
 * be strictly worse than not drawing them.
 *
 * One node per track, not one per program step — see `lib/threads.ts`. Seven
 * decisions fit on one screen (~770px for an organization, ~680 for a personal
 * workspace); twenty-seven did not, and the only way to find out what any of
 * them wanted was to click it anyway.
 *
 * The viewport is capped rather than fixed: the map centres itself in whatever
 * room it has, and only scrolls when there genuinely is not enough — which on a
 * phone there is not.
 */
export function JourneyGraph({
  data,
  threads,
  selectedTrackId,
  recommendedTrackId,
  onSelect
}: {
  data: JourneyOverview;
  threads: JourneyThread[];
  selectedTrackId: string | null;
  recommendedTrackId: string | null;
  onSelect: (trackId: string) => void;
}) {
  const { t, dynamic } = useJourneyCopy();
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  const nodes = useMemo(() => threads.map((thread) => thread.node), [threads]);
  const tracks = useMemo(
    () => threads.map((thread) => thread.track),
    [threads]
  );

  const layout = useMemo(
    () =>
      buildGraphLayout(
        nodes,
        tracks,
        compact ? COMPACT_METRICS : COMFORTABLE_METRICS
      ),
    [nodes, tracks, compact]
  );

  /**
   * Measured on the container, not asked of the viewport: collapsing the
   * sidebar changes how much room the map has without the window moving at
   * all, and a media query cannot see that. A map pans at every size, so the
   * question is not "does the canvas fit" — it never fully does — but "is there
   * room for full-size nodes", which is a screen-width question.
   */
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(([entry]) => {
      setCompact(entry.contentRect.width < COMPACT_BELOW);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  /**
   * Arrive centred on the hub.
   *
   * `useLayoutEffect` so it lands before paint — the map appearing scrolled to
   * its top-left corner and then jumping is worse than no animation at all.
   */
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = layout.hubX - viewport.clientWidth / 2;
    viewport.scrollTop = layout.hubY - viewport.clientHeight / 2;
  }, [layout.hubX, layout.hubY]);

  const focusNode = useCallback((nodeId: string) => {
    const el = containerRef.current?.querySelector<HTMLButtonElement>(
      `[data-node-id="${CSS.escape(nodeId)}"]`
    );
    el?.focus();
  }, []);

  /**
   * Arrow keys travel the map, brackets jump threads.
   *
   * Handled on the container rather than per node so the mapping lives in one
   * place, and only when the event came from a node — typing in the drawer must
   * not move the map selection.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const nodeId = (event.target as HTMLElement).dataset?.nodeId;
      if (!nodeId) return;

      const neighbours = graphNeighbours(layout, nodeId);
      const target =
        event.key === 'ArrowUp'
          ? neighbours.up
          : event.key === 'ArrowDown'
            ? neighbours.down
            : event.key === 'ArrowLeft'
              ? neighbours.left
              : event.key === 'ArrowRight'
                ? neighbours.right
                : event.key === '['
                  ? neighbours.prevTrack
                  : event.key === ']'
                    ? neighbours.nextTrack
                    : undefined;

      if (!target) return;
      event.preventDefault();
      focusNode(target);
    },
    [layout, focusNode]
  );

  /** Keyed by the map node's id, which for a thread is its track id. */
  const threadOf = useMemo(
    () =>
      new Map<string, JourneyThread>(
        threads.map((thread) => [thread.node.id, thread])
      ),
    [threads]
  );

  if (!layout.nodes.length) return null;

  return (
    <div className='flex flex-col gap-3'>
      <div
        ref={viewportRef}
        className='relative max-h-[min(72vh,680px)] overflow-auto overscroll-x-contain'
      >
        {/*
          `min-w/h-full` plus centring, rather than a fixed-height scroller: when
          the map is smaller than the space it has — a five-thread personal
          workspace on a desktop — it sits in the middle of the card instead of
          in the top-left corner of a box of dead air, and when it is bigger the
          wrapper simply grows to the canvas and no centring offset can clip the
          top or the left edge out of reach of the scrollbar.
        */}
        <div className='flex min-h-full min-w-full items-center justify-center'>
          <div
            ref={containerRef}
            onKeyDown={onKeyDown}
            role='group'
            aria-label={t('a11y.graph')}
            aria-describedby='journey-graph-keys'
            className='relative shrink-0'
            style={{ width: layout.width, height: layout.height }}
          >
            <p id='journey-graph-keys' className='sr-only'>
              {t('a11y.keyboardHint')}
            </p>

            {/* Threads. Purely decorative: every dependency is also stated in text. */}
            <svg
              aria-hidden='true'
              focusable='false'
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              className='pointer-events-none absolute inset-0'
            >
              {layout.edges.map((edge) => {
                const track = trackPresentation(edge.track);
                // A thread keeps its track's colour whether or not it has been
                // travelled — that is what makes six threads read as six threads
                // rather than as one grey web. Only cross-track dependencies go
                // neutral: they are the secondary story.
                const threaded = edge.spoke || !edge.crossTrack;
                return (
                  <path
                    key={edge.id}
                    d={edge.path}
                    fill='none'
                    stroke={threaded ? track.stroke : 'currentColor'}
                    strokeWidth={edge.complete ? 2.5 : edge.spoke ? 2 : 1.5}
                    strokeLinecap='round'
                    strokeDasharray={
                      edge.blocked && !edge.complete
                        ? '5 6'
                        : edge.crossTrack
                          ? '2 6'
                          : undefined
                    }
                    className={cn(
                      'transition-opacity duration-500 motion-reduce:transition-none',
                      edge.complete
                        ? 'opacity-95'
                        : edge.crossTrack
                          ? 'text-muted-foreground opacity-30'
                          : edge.blocked
                            ? 'opacity-45'
                            : 'opacity-70'
                    )}
                  />
                );
              })}
            </svg>

            {/*
            No thread labels: with one node per thread the node already carries
            the track's name, and a label repeating it just past the box was the
            same word twice, 80px apart.
          */}

            <JourneyHub
              data={data}
              size={layout.metrics.hubRadius * 2}
              style={{
                left: layout.hubX - layout.metrics.hubRadius,
                top: layout.hubY - layout.metrics.hubRadius
              }}
            />

            {layout.nodes.map((positioned) => {
              const thread = threadOf.get(positioned.node.id);
              if (!thread) return null;
              const reward = positioned.node.reward;
              const label = dynamic(
                `track.${thread.track.id}.name`,
                thread.track.id
              );
              const steps = t('graph.trackNodes', {
                completed: thread.stepsDone,
                total: thread.stepsTotal
              });

              return (
                <JourneyGraphNode
                  key={positioned.node.id}
                  node={positioned.node}
                  label={label}
                  caption={steps}
                  ariaLabel={t('a11y.threadSummary', {
                    name: label,
                    status: t(`status.${positioned.node.status}` as never),
                    done: thread.stepsDone,
                    total: thread.stepsTotal
                  })}
                  selected={selectedTrackId === positioned.node.id}
                  recommended={recommendedTrackId === positioned.node.id}
                  rewardLabel={
                    reward && reward.amountCents > 0
                      ? formatCents(reward.amountCents, locale)
                      : null
                  }
                  compact={layout.metrics.compact}
                  onSelect={onSelect}
                  style={{
                    left: positioned.x,
                    top: positioned.y,
                    width: layout.metrics.nodeWidth,
                    height: layout.metrics.nodeHeight
                  }}
                  {...{ 'data-node-id': positioned.node.id }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <p className='text-muted-foreground text-center text-xs'>
        {t('graph.hint')}
      </p>

      {/*
        A text equivalent of the map. The visual layout carries meaning (threads
        are tracks, distance is dependency depth) that a screen reader cannot
        infer from absolutely-positioned buttons, so the structure is also
        available as a plain nested list.
      */}
      <div className='sr-only'>
        <h3>{t('a11y.graph')}</h3>
        {threads.map((thread) => {
          const name = dynamic(
            `track.${thread.track.id}.name`,
            thread.track.id
          );
          return (
            <section key={thread.track.id}>
              <h4>
                {name} — {t(`status.${thread.node.status}` as never)}
              </h4>
              <ul aria-label={t('a11y.nodeList', { track: name })}>
                {thread.steps.map((step) => (
                  <li key={step.id}>
                    {dynamic(`node.${step.id}.name`, step.id)} —{' '}
                    {t(`status.${step.status}` as never)}
                    {step.blockedBy.length > 0 &&
                      `. ${t('status.blockedBy', {
                        nodes: step.blockedBy
                          .map((id) => dynamic(`node.${id}.name`, id))
                          .join(', ')
                      })}`}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
