'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { IconAdjustments, IconLock, IconPencil } from '@tabler/icons-react';
import { DashboardFiltersProvider } from '../lib/filters-context';
import { DashboardFilters } from './dashboard-filters';
import { WidgetGrid } from './widget-grid-loader';
import { AddWidgetMenu } from './add-widget-menu';
import type {
  DashboardLayoutResponse,
  DashboardWidget,
  WidgetType,
  DashboardScope
} from '../lib/types';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import './dashboard.css';

interface DashboardPageInnerProps {
  initialLayout: DashboardLayoutResponse;
  initialScope: DashboardScope;
}

const SAVE_DEBOUNCE_MS = 600;

function DashboardPageInner({
  initialLayout,
  initialScope
}: DashboardPageInnerProps) {
  const t = useTranslations('dashboard.page');
  const api = useApi();
  const [widgets, setWidgets] = React.useState<DashboardWidget[]>(
    initialLayout.widgets
  );
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const dirtyRef = React.useRef(false);

  const persist = React.useCallback(
    async (next: DashboardWidget[]) => {
      setSaving(true);
      try {
        await api.put('/dashboard/layout/widgets', {
          scope: initialScope,
          widgets: next.map((w) => ({
            type: w.type,
            title: w.title,
            x: w.x,
            y: w.y,
            w: w.w,
            h: w.h,
            config: w.config ?? null,
            isVisible: w.isVisible
          }))
        });
        dirtyRef.current = false;
      } finally {
        setSaving(false);
      }
    },
    [api, initialScope]
  );

  // Debounced persistence whenever widgets change after the first render.
  React.useEffect(() => {
    if (!dirtyRef.current) return;
    const t = setTimeout(() => {
      void persist(widgets);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [widgets, persist]);

  const handleLayoutChange = (next: DashboardWidget[]) => {
    dirtyRef.current = true;
    setWidgets(next);
  };

  const handleRemove = (id: string) => {
    dirtyRef.current = true;
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  };

  const handleAdd = (type: WidgetType, title: string, w: number, h: number) => {
    const maxY = widgets.reduce((acc, x) => Math.max(acc, x.y + x.h), 0);
    const newWidget: DashboardWidget = {
      // Temporary id — server replaces on next persist
      id: `tmp-${Math.random().toString(36).slice(2)}`,
      type,
      title,
      x: 0,
      y: maxY,
      w,
      h,
      config: null,
      isVisible: true
    };
    dirtyRef.current = true;
    setWidgets((prev) => [...prev, newWidget]);
  };

  const existingTypes = React.useMemo(
    () => new Set(widgets.map((w) => w.type)),
    [widgets]
  );

  return (
    <PageContainer>
      <div className='flex w-full flex-1 flex-col gap-4'>
        <DashboardHeader saving={saving} />
        <DashboardFilters />
        <div className='flex items-center justify-end gap-2'>
          {editing && (
            <AddWidgetMenu onAdd={handleAdd} existingTypes={existingTypes} />
          )}
          <Button
            variant={editing ? 'default' : 'outline'}
            size='sm'
            onClick={() => setEditing((v) => !v)}
            className='gap-1'
          >
            {editing ? (
              <>
                <IconLock size={14} /> {t('doneEditing')}
              </>
            ) : (
              <>
                <IconPencil size={14} /> {t('customize')}
              </>
            )}
          </Button>
        </div>
        <WidgetGrid
          widgets={widgets}
          onLayoutChange={handleLayoutChange}
          onRemoveWidget={handleRemove}
          editable={editing}
        />
      </div>
    </PageContainer>
  );
}

function DashboardHeader({ saving }: { saving: boolean }) {
  const t = useTranslations('dashboard.page');
  const { hasOrg } = useOrgRole();
  return (
    <div className='flex items-center justify-between gap-2'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>
          {hasOrg ? t('headerOrg') : t('headerSolo')}
        </h1>
        <p className='text-muted-foreground text-sm'>{t('subtitle')}</p>
      </div>
      <div className='flex items-center gap-2'>
        {saving && (
          <span className='text-muted-foreground flex items-center gap-1 text-xs'>
            <IconAdjustments className='animate-spin' size={12} />{' '}
            {t('savingLayout')}
          </span>
        )}
      </div>
    </div>
  );
}

export function Dashboard({
  initialLayout
}: {
  initialLayout: DashboardLayoutResponse;
}) {
  return (
    <DashboardFiltersProvider defaultScope={initialLayout.scope}>
      <DashboardPageInner
        initialLayout={initialLayout}
        initialScope={initialLayout.scope}
      />
    </DashboardFiltersProvider>
  );
}
