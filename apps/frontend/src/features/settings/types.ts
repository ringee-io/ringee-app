import type { ComponentType } from 'react';

/** Sections rendered in the settings dialog's left rail, in display order. */
export type SettingsSectionId = 'settings' | 'integrations';

/**
 * Every pane the settings dialog can show. The id is the stable handle used by
 * the store, the deep-link callers (sidebar user menu) and the translations
 * under `settings.dialog.items.<id>`.
 */
export type SettingsItemId =
  | 'general'
  | 'script'
  | 'calendars'
  | 'recording'
  | 'desk-phones'
  | 'crm'
  | 'enrichment'
  | 'leads'
  | 'custom'
  | 'connectors'
  | 'calendar-providers';

export interface SettingsNavItem {
  id: SettingsItemId;
  section: SettingsSectionId;
  /** Icon component (lucide) rendered in the rail. */
  icon: ComponentType<{ className?: string }>;
  /**
   * Mirrors the gating already applied by the standalone settings pages.
   * Cosmetic only — the API enforces the same boundary.
   */
  adminOnly?: boolean;
}
