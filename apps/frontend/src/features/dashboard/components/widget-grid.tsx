'use client';

// @ts-ignore
import * as React from 'react';
import {
  Responsive,
  useContainerWidth,
  verticalCompactor,
  type Layout,
  type ResponsiveLayouts
} from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { renderWidget } from '../widgets/registry';
import type { DashboardWidget } from '../lib/types';

type Breakpoint = 'lg' | 'md' | 'sm' | 'xs' | 'xxs';

const COLS: Record<Breakpoint, number> = {
  lg: 12,
  md: 12,
  sm: 6,
  xs: 4,
  xxs: 2
};
const BREAKPOINTS: Record<Breakpoint, number> = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 480,
  xxs: 0
};
const ROW_HEIGHT = 60;
const MARGIN: readonly [number, number] = [12, 12];

const BREAKPOINT_ORDER: readonly Breakpoint[] = ['lg', 'md', 'sm', 'xs', 'xxs'];

/**
 * Resolve the active breakpoint from the *viewport* width instead of the grid
 * container width. The Quick Dial side panel shrinks the dashboard column
 * (md:w-[30%]); if we let react-grid-layout derive the breakpoint from the
 * shrunken container it would drop column counts and reshuffle every widget
 * each time the dialer opens/closes. Keying off the viewport keeps the column
 * count stable while the dialer toggles — widgets just render narrower.
 */
function breakpointForViewport(viewportWidth: number): Breakpoint {
  for (const bp of BREAKPOINT_ORDER) {
    if (viewportWidth >= BREAKPOINTS[bp]) return bp;
  }
  return 'xxs';
}

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
  // v2 hook — replaces the legacy WidthProvider HOC. Observes container size
  // with ResizeObserver and gives us a ref to attach.
  const { width, containerRef, mounted } = useContainerWidth({
    measureBeforeMount: false,
    initialWidth: 1200
  });

  // Drive the responsive breakpoint off the viewport, not the container width,
  // so opening/closing the Quick Dial panel doesn't reflow the widgets. The
  // grid is client-only (next/dynamic ssr:false), so window is available on the
  // first render.
  const [breakpoint, setBreakpoint] = React.useState<Breakpoint>(() =>
    typeof window === 'undefined'
      ? 'lg'
      : breakpointForViewport(window.innerWidth)
  );
  React.useEffect(() => {
    const onResize = () =>
      setBreakpoint(breakpointForViewport(window.innerWidth));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const layout: Layout = React.useMemo(
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

  // Responsive grids want a layout per breakpoint. We mirror the same layout
  // across breakpoints — react-grid-layout adapts column counts internally.
  const layouts: ResponsiveLayouts<Breakpoint> = React.useMemo(
    () => ({ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }),
    [layout]
  );

  const handleLayoutChange = React.useCallback(
    (next: Layout) => {
      const byId = new Map(next.map((l) => [l.i, l]));
      let dirty = false;
      const updated = widgets.map((w) => {
        const l = byId.get(w.id);
        if (!l) return w;
        if (l.x === w.x && l.y === w.y && l.w === w.w && l.h === w.h) return w;
        dirty = true;
        return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
      });
      if (dirty) onLayoutChange(updated);
    },
    [widgets, onLayoutChange]
  );

  // dragConfig / resizeConfig replace the old flat isDraggable/isResizable/
  // draggableHandle props in v2.
  const dragConfig = React.useMemo(
    () => ({
      enabled: editable,
      handle: '.widget-drag-handle',
      threshold: 3,
      bounded: false
    }),
    [editable]
  );
  const resizeConfig = React.useMemo(
    () => ({ enabled: editable, handles: ['se'] as const }),
    [editable]
  );

  return (
    // @ts-ignore
    <div ref={containerRef} className='dashboard-grid'>
      {mounted && width > 0 && (
        // @ts-ignore
        <Responsive<Breakpoint>
          width={width}
          breakpoint={breakpoint}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          layouts={layouts}
          rowHeight={ROW_HEIGHT}
          margin={MARGIN}
          dragConfig={dragConfig}
          resizeConfig={resizeConfig}
          compactor={verticalCompactor}
          // Persist only on explicit user interaction. Wiring onLayoutChange
          // here would also fire on width-driven reflows and save positions the
          // user never set (corrupting the layout when the dialer toggles).
          onDragStop={handleLayoutChange}
          onResizeStop={handleLayoutChange}
        >
          {widgets.map((w) => (
            // @ts-ignore
            <div key={w.id} className='dashboard-widget'>
              {renderWidget({
                type: w.type,
                title: w.title,
                onRemove:
                  editable && onRemoveWidget
                    ? () => onRemoveWidget(w.id)
                    : undefined
              })}
              {/* @ts-ignore  */}
            </div>
          ))}
        </Responsive>
      )}
      {/* @ts-ignore  */}
    </div>
  );
}
