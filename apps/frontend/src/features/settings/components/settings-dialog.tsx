'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { ChevronLeft, PanelLeft, Search, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { useSettingsDialogUrl } from '../hooks/use-settings-dialog-url';
import {
  SETTINGS_SECTIONS,
  resolveSettingsItem,
  visibleSettingsItems
} from '../lib/settings-nav';
import { useSettingsDialogStore } from '../store/settings-dialog.store';
import type { SettingsItemId } from '../types';
import { GeneralPanel } from './panels/general-panel';

/**
 * Where a CRM OAuth round-trip comes back to. The dialog is gone by then, so
 * the standalone Integrations page is what shows the result.
 */
const CRM_OAUTH_RETURN_URL = '/dashboard/settings/integrations';

function PanelSkeleton() {
  return (
    <div className='space-y-3'>
      <Skeleton className='h-8 w-48' />
      <Skeleton className='h-28 w-full rounded-xl' />
      <Skeleton className='h-28 w-full rounded-xl' />
    </div>
  );
}

// The dialog is mounted by the dashboard shell on every page, so the panes stay
// out of that bundle and are fetched when a pane is actually opened. Only
// `GeneralPanel` — the default pane, and a small one — is imported eagerly.
const loading = () => <PanelSkeleton />;

const ScriptEditor = dynamic(
  () => import('./script-editor').then((m) => m.ScriptEditor),
  { loading }
);
const RecordingSettingsCard = dynamic(
  () =>
    import('@/features/transcription/components/recording-settings-card').then(
      (m) => m.RecordingSettingsCard
    ),
  { loading }
);
const DeskPhonesView = dynamic(
  () =>
    import('@/features/desk-phones/components/desk-phones-view').then(
      (m) => m.DeskPhonesView
    ),
  { loading }
);
const CrmTab = dynamic(
  () =>
    import('@/features/integrations/components/tabs/crm-tab').then(
      (m) => m.CrmTab
    ),
  { loading }
);
const EnrichmentTab = dynamic(
  () =>
    import('@/features/integrations/components/tabs/enrichment-tab').then(
      (m) => m.EnrichmentTab
    ),
  { loading }
);
const LeadSearchPanel = dynamic(
  () =>
    import('@/features/integrations/components/lead-search-panel').then(
      (m) => m.LeadSearchPanel
    ),
  { loading }
);
const CustomIntegrationsTab = dynamic(
  () =>
    import(
      '@/features/integrations/components/tabs/custom-integrations-tab'
    ).then((m) => m.CustomIntegrationsTab),
  { loading }
);
const ConnectorsTab = dynamic(
  () =>
    import('@/features/integrations/components/tabs/connectors-tab').then(
      (m) => m.ConnectorsTab
    ),
  { loading }
);
const CalendarsManager = dynamic(
  () =>
    import('@/features/meetings/components/calendars-manager').then(
      (m) => m.CalendarsManager
    ),
  { loading }
);
const CalendarIntegrations = dynamic(
  () =>
    import('@/features/meetings/components/calendar-integrations').then(
      (m) => m.CalendarIntegrations
    ),
  { loading }
);

/**
 * Ringee's settings surface: one modal, sections in a rail on the left, the
 * selected pane on the right. Every pane is an existing component — the dialog
 * only composes and gates them; it owns no settings logic of its own.
 *
 * Mounted once by the dashboard shell and driven by `useSettingsDialogStore`,
 * so any entry point can deep-link into a pane.
 */
export function SettingsDialog() {
  const open = useSettingsDialogStore((s) => s.open);
  const setOpen = useSettingsDialogStore((s) => s.setOpen);
  const openSettings = useSettingsDialogStore((s) => s.openSettings);
  const requestedItem = useSettingsDialogStore((s) => s.requestedItem);
  const requestedTarget = useSettingsDialogStore((s) => s.requestedTarget);
  const setItem = useSettingsDialogStore((s) => s.setItem);
  const setTarget = useSettingsDialogStore((s) => s.setTarget);

  const t = useTranslations('settings.dialog');
  const { canAccessAdminFeatures } = useOrgRole();

  const [query, setQuery] = React.useState('');
  // Below `md` the rail and the pane share the same space; the rail slides over.
  const [navOpen, setNavOpen] = React.useState(false);
  const paneRef = React.useRef<HTMLDivElement>(null);

  const items = React.useMemo(
    () => visibleSettingsItems(canAccessAdminFeatures),
    [canAccessAdminFeatures]
  );

  const activeId = resolveSettingsItem(requestedItem, items);
  const activeItem = items.find((item) => item.id === activeId) ?? null;

  // Mirrors the open pane into the URL fragment (`#settings/general`) and
  // reopens from it, so panes are linkable and Back closes the dialog.
  useSettingsDialogUrl(activeId);

  // ⇧⌘, / ⇧Ctrl+, — the gesture the rest of the category already uses. ⌘K is
  // taken by the command bar, so settings gets the comma.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ',' || !event.shiftKey) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      openSettings();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openSettings]);

  // A reopened dialog starts clean rather than on the last search.
  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setNavOpen(false);
    }
  }, [open]);

  // A new pane starts at its top, not at the offset the previous one was at.
  React.useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 });
  }, [activeId]);

  const normalizedQuery = query.trim().toLowerCase();
  const sections = SETTINGS_SECTIONS.map((section) => ({
    id: section,
    items: items.filter(
      (item) =>
        item.section === section &&
        (!normalizedQuery ||
          t(`items.${item.id}.label`).toLowerCase().includes(normalizedQuery) ||
          t(`items.${item.id}.description`)
            .toLowerCase()
            .includes(normalizedQuery))
    )
  })).filter((section) => section.items.length > 0);

  const selectItem = (id: SettingsItemId) => {
    setItem(id);
    setNavOpen(false);
  };

  // Enter from the search field opens the first match, so a search never needs
  // the mouse to finish.
  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    const first = sections[0]?.items[0];
    if (!first) return;
    event.preventDefault();
    selectItem(first.id);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className='h-[min(88vh,760px)] w-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[1040px]'
      >
        {/* Radix needs a labelled dialog; the visible title lives in the pane
            header, so the announced pair is hidden here. */}
        <DialogTitle className='sr-only'>{t('title')}</DialogTitle>
        <DialogDescription className='sr-only'>
          {t('description')}
        </DialogDescription>

        <div className='relative flex h-full min-h-0'>
          <aside
            className={cn(
              // Opaque while it overlays the pane on small screens; a tint
              // beside it from `md` up.
              'bg-sidebar md:bg-sidebar/50 absolute inset-0 z-20 flex flex-col border-r md:relative md:z-auto md:w-[216px] md:shrink-0',
              !navOpen && 'hidden md:flex'
            )}
          >
            <div className='flex items-center gap-2 p-3'>
              <div className='relative flex-1'>
                <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder={t('searchPlaceholder')}
                  aria-label={t('searchPlaceholder')}
                  className='h-9 pl-8'
                />
              </div>
              <button
                type='button'
                onClick={() => setNavOpen(false)}
                aria-label={t('closeNav')}
                className='hover:bg-accent text-muted-foreground hover:text-foreground flex size-9 shrink-0 items-center justify-center rounded-md transition-colors md:hidden'
              >
                <ChevronLeft className='size-4' />
              </button>
            </div>

            <nav className='flex-1 space-y-5 overflow-y-auto px-2 pt-1 pb-4'>
              {sections.map((section) => (
                <div key={section.id} className='space-y-1'>
                  <p className='text-muted-foreground px-3 py-1 text-xs font-medium'>
                    {t(`sections.${section.id}`)}
                  </p>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.id === activeId;
                    return (
                      <button
                        key={item.id}
                        type='button'
                        onClick={() => selectItem(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
                          isActive
                            ? 'bg-accent text-accent-foreground font-medium'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                        )}
                      >
                        <Icon className='size-4 shrink-0' />
                        <span className='min-w-0 flex-1 text-left leading-snug break-words'>
                          {t(`items.${item.id}.label`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {sections.length === 0 && (
                <p className='text-muted-foreground px-3 py-6 text-center text-xs'>
                  {t('noResults', { query: query.trim() })}
                </p>
              )}
            </nav>
          </aside>

          <section className='flex min-w-0 flex-1 flex-col'>
            <header className='flex items-start gap-3 border-b px-4 py-4 sm:px-6'>
              <button
                type='button'
                onClick={() => setNavOpen(true)}
                aria-label={t('openNav')}
                className='hover:bg-accent text-muted-foreground hover:text-foreground -ml-1 flex size-8 shrink-0 items-center justify-center rounded-md transition-colors md:hidden'
              >
                <PanelLeft className='size-4' />
              </button>

              <div className='min-w-0 flex-1'>
                <h2 className='truncate text-base font-semibold'>
                  {activeItem ? t(`items.${activeItem.id}.label`) : t('title')}
                </h2>
                {activeItem && (
                  <p className='text-muted-foreground mt-0.5 text-xs'>
                    {t(`items.${activeItem.id}.description`)}
                  </p>
                )}
              </div>

              <button
                type='button'
                onClick={() => setOpen(false)}
                aria-label={t('close')}
                className='hover:bg-accent text-muted-foreground hover:text-foreground -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md transition-colors'
              >
                <X className='size-4' />
              </button>
            </header>

            <div
              ref={paneRef}
              className='min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6'
            >
              {activeId && (
                <SettingsPanel
                  id={activeId}
                  target={requestedTarget}
                  onTargetChange={setTarget}
                />
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Only the selected pane mounts, so opening the dialog does not fan out into
 * every settings and integrations request at once.
 */
function SettingsPanel({
  id,
  target,
  onTargetChange
}: {
  id: SettingsItemId;
  /** The row the caller deep-linked to, for the panes that have rows. */
  target: string | null;
  /** Keeps the fragment on the row the pane is actually showing. */
  onTargetChange: (target: string | null) => void;
}) {
  switch (id) {
    case 'general':
      return <GeneralPanel />;
    case 'script':
      return <ScriptEditor />;
    case 'recording':
      return <RecordingSettingsCard className='max-w-2xl' />;
    case 'desk-phones':
      return <DeskPhonesView />;
    case 'crm':
      return <CrmTab oauthReturnUrl={CRM_OAUTH_RETURN_URL} />;
    case 'enrichment':
      return <EnrichmentTab />;
    case 'leads':
      return <LeadSearchPanel />;
    case 'custom':
      return <CustomIntegrationsTab />;
    case 'connectors':
      return <ConnectorsTab />;
    case 'calendars':
      return (
        <CalendarsManager
          initialCalendarId={target ?? undefined}
          onCalendarChange={onTargetChange}
        />
      );
    case 'calendar-providers':
      return <CalendarIntegrations />;
  }
}
