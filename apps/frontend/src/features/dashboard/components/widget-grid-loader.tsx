'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import type { DashboardWidget } from '../lib/types';

interface WidgetGridProps {
  widgets: DashboardWidget[];
  onLayoutChange: (widgets: DashboardWidget[]) => void;
  onRemoveWidget?: (id: string) => void;
  editable?: boolean;
}

function GridLoader() {
  const t = useTranslations('dashboard.widgets.shell');
  return (
    <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>
  );
}

/**
 * react-grid-layout v2 (and its react-resizable / react-draggable deps) touch
 * the DOM and ship ESM-only chunks that break Next.js's static prerender of
 * unrelated pages (e.g. /_not-found) when bundled into the shared graph.
 *
 * Loading the grid through next/dynamic with `ssr: false` keeps it fully
 * client-side and isolates its chunk from server prerender.
 *
 * See: https://github.com/react-grid-layout/react-grid-layout#installation
 */
export const WidgetGrid = dynamic<WidgetGridProps>(
  () => import('./widget-grid').then((m) => m.WidgetGrid as ComponentType<WidgetGridProps>),
  {
    ssr: false,
    loading: () => <GridLoader />
  }
);
