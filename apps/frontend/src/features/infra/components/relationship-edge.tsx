'use client';

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps
} from '@xyflow/react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useInfraStore } from '../store/infra.store';
import { EDGE_STROKE, type EdgeTone } from '../lib/edges';

export interface RelationshipEdgeData extends Record<string, unknown> {
  tone: EdgeTone;
  /** Full human sentence, shown in the label pill on hover / select. */
  label: string;
  /** Short verb chip ("assigned to", "routes to", …). */
  verb: string;
  /** Endpoint node ids — mirrored into the store on hover for highlighting. */
  source: string;
  target: string;
}

/**
 * A single relationship rendered as its own arrow between two dedicated,
 * distributed handles. Encodes state via colour + dash + a live flow on active
 * links, brightens on hover, and reveals a readable label pill on hover or when
 * selected — so a busy graph stays legible and every connection reads
 * individually.
 */
function RelationshipEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data
}: EdgeProps) {
  const d = data as RelationshipEdgeData;
  const hoveredEdge = useInfraStore((s) => s.hoveredEdge);
  const setHoveredEdge = useInfraStore((s) => s.setHoveredEdge);
  const hovered = hoveredEdge?.id === id;
  const active = hoveredEdge != null;
  const show = hovered || !!selected;

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 14
  });

  const stroke = EDGE_STROKE[d.tone];
  const dash = d.tone === 'active' ? undefined : '6 4';
  // Dim the other edges while one is hovered so the focused relationship pops.
  const opacity = !active || hovered ? 1 : 0.35;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth: hovered || selected ? 2.75 : 1.6,
          strokeDasharray: dash,
          opacity,
          filter: hovered
            ? `drop-shadow(0 0 4px color-mix(in oklch, ${stroke} 60%, transparent))`
            : undefined,
          transition: 'stroke-width 120ms ease, opacity 120ms ease'
        }}
      />

      {/* Invisible fat hit-area so the whole relationship is easy to hover/click. */}
      <path
        d={path}
        fill='none'
        stroke='transparent'
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() =>
          setHoveredEdge({ id, source: d.source, target: d.target })
        }
        onMouseLeave={() => setHoveredEdge(null)}
      />

      {show ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'nodrag nopan pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2',
              'bg-card/95 rounded-full border px-2 py-0.5 text-[10px] font-medium shadow-md ring-1 ring-white/5 backdrop-blur'
            )}
            style={{
              left: labelX,
              top: labelY,
              color: d.tone === 'broken' ? 'var(--destructive)' : undefined
            }}
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeImpl);
