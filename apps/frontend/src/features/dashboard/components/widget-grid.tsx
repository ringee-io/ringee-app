'use client';

import * as React from 'react';
// v2.x of react-grid-layout moved the v1-compatible API (Responsive +
// WidthProvider HOC) to the `/legacy` subpath. The main entry now exposes
// a hooks-based API that does NOT export WidthProvider.
// Quick start: https://github.com/react-grid-layout/react-grid-layout#quick-start
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { renderWidget } from '../widgets/registry';
import type { DashboardWidget } from '../lib/types';

const ResponsiveGridLayout = WidthProvider(Responsive);

const COLS = { lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 };
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const ROW_HEIGHT = 60;

interface WidgetGridProps {
  widgets: DashboardWidget[];
  /** Called whenever the user drags or resizes a widget. */
  onLayoutChange: (widgets: DashboardWidget[]) => void;
  onRemoveWidget?: (id: string) => void;
  editable?: boolean;
}

export function WidgetGrid({
  widgets,
  onLayoutChange,
  onRemoveWidget,
  editable = true
}: WidgetGridProps) {
  const layout: Layout[] = React.useMemo(
    () =>
      widgets.map((w) => ({
        i: w.id,
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
        minW: 2,
        minH: 2
      })),
    [widgets]
  );

  const handleChange = React.useCallback(
    (next: Layout[]) => {
      const byId = new Map(next.map((l) => [l.i, l]));
      const updated = widgets.map((w) => {
        const l = byId.get(w.id);
        if (!l) return w;
        if (l.x === w.x && l.y === w.y && l.w === w.w && l.h === w.h) return w;
        return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
      });
      const dirty = updated.some(
        (w, i) =>
          w.x !== widgets[i].x ||
          w.y !== widgets[i].y ||
          w.w !== widgets[i].w ||
          w.h !== widgets[i].h
      );
      if (dirty) onLayoutChange(updated);
    },
    [widgets, onLayoutChange]
  );

  return (
    <ResponsiveGridLayout
      className='dashboard-grid'
      layouts={{ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }}
      breakpoints={BREAKPOINTS}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      margin={[12, 12]}
      isDraggable={editable}
      isResizable={editable}
      draggableHandle='.widget-drag-handle'
      onLayoutChange={handleChange}
      compactType='vertical'
    >
      {widgets.map((w) => (
        <div key={w.id} className='dashboard-widget'>
          {renderWidget({
            type: w.type,
            title: w.title,
            onRemove: editable && onRemoveWidget ? () => onRemoveWidget(w.id) : undefined
          })}
        </div>
      ))}
    </ResponsiveGridLayout>
  );
}
