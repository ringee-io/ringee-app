import {
  Bot,
  FileText,
  Mic,
  Phone,
  Plug,
  PlugZap,
  SlidersHorizontal,
  Sparkles,
  Users
} from 'lucide-react';
import type {
  SettingsItemId,
  SettingsNavItem,
  SettingsSectionId
} from '../types';

/** Section order in the rail. */
export const SETTINGS_SECTIONS: SettingsSectionId[] = [
  'settings',
  'integrations'
];

/**
 * Single source of truth for the settings dialog navigation. Panels are looked
 * up by id in `settings-dialog.tsx`; labels live in `settings.dialog.items`.
 */
export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'general', section: 'settings', icon: SlidersHorizontal },
  { id: 'script', section: 'settings', icon: FileText },
  { id: 'recording', section: 'settings', icon: Mic, adminOnly: true },
  { id: 'desk-phones', section: 'settings', icon: Phone, adminOnly: true },
  { id: 'crm', section: 'integrations', icon: Plug, adminOnly: true },
  {
    id: 'enrichment',
    section: 'integrations',
    icon: Sparkles,
    adminOnly: true
  },
  { id: 'leads', section: 'integrations', icon: Users },
  { id: 'custom', section: 'integrations', icon: PlugZap, adminOnly: true },
  { id: 'connectors', section: 'integrations', icon: Bot }
];

/** The items a given role may open. */
export function visibleSettingsItems(
  canAccessAdminFeatures: boolean
): SettingsNavItem[] {
  return SETTINGS_NAV_ITEMS.filter(
    (item) => canAccessAdminFeatures || !item.adminOnly
  );
}

/**
 * Resolves the pane to show for a requested id. A member deep-linking into an
 * admin-only pane (the "Integrations" entry points at CRM) lands on the first
 * pane of the same section they can actually open, never on an empty dialog.
 */
export function resolveSettingsItem(
  requested: SettingsItemId | null,
  items: SettingsNavItem[]
): SettingsItemId | null {
  if (items.length === 0) return null;
  if (!requested) return items[0].id;

  const exact = items.find((item) => item.id === requested);
  if (exact) return exact.id;

  const section = SETTINGS_NAV_ITEMS.find(
    (item) => item.id === requested
  )?.section;
  const sameSection = items.find((item) => item.section === section);

  return (sameSection ?? items[0]).id;
}

/**
 * The dialog addresses itself through the URL fragment — `#settings/general`,
 * `#settings/recording` — so a pane can be linked to, reloaded and reached with
 * the browser's Back button, without the modal needing a route of its own.
 */
export const SETTINGS_HASH_PREFIX = 'settings';

const KNOWN_ITEM_IDS = new Set<string>(SETTINGS_NAV_ITEMS.map((i) => i.id));

/** The fragment that addresses a pane, ready for `history.pushState`. */
export function settingsHash(id: SettingsItemId): string {
  return `#${SETTINGS_HASH_PREFIX}/${id}`;
}

/** Whether a fragment belongs to the settings dialog at all. */
export function isSettingsHash(hash: string): boolean {
  const [prefix, , ...rest] = stripHash(hash).split('/');
  return prefix === SETTINGS_HASH_PREFIX && rest.length === 0;
}

/**
 * The pane a fragment names, or `null` for a bare `#settings` and for a pane id
 * that no longer exists — both of which fall back to the first pane, and get
 * the URL rewritten to the canonical form.
 */
export function settingsItemFromHash(hash: string): SettingsItemId | null {
  if (!isSettingsHash(hash)) return null;
  const item = stripHash(hash).split('/')[1];
  return item && KNOWN_ITEM_IDS.has(item) ? (item as SettingsItemId) : null;
}

function stripHash(hash: string): string {
  return hash.startsWith('#') ? hash.slice(1) : hash;
}
