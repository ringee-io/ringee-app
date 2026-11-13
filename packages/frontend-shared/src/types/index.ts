import { Icons } from "../components/icons";

export interface NavItem {
  title: string;
  url: string;
  /** Hidden from org members; visible to org admins and freelancers (no org). */
  adminOnly?: boolean;
  /** Available only while an organization workspace is active. */
  organizationOnly?: boolean;
  /**
   * An organization-only entry a personal workspace can also be granted, as
   * the API answers it (`useVoiceAgentModuleAccess`) — the AI Voice Agents
   * personal pilot.
   */
  personalAccess?: "ai_voice_agents";
  /** Opened from the user menu rather than the sidebar; still a ⌘K destination. */
  inUserMenu?: boolean;
  disabled?: boolean;
  external?: boolean;
  shortcut?: [string, string];
  icon?: keyof typeof Icons;
  /** Maturity pill rendered next to the title in the sidebar. */
  badge?: "beta";
  label?: string;
  description?: string;
  isActive?: boolean;
  items?: NavItem[];
}

export interface NavItemWithChildren extends NavItem {
  items: NavItemWithChildren[];
}

export interface NavItemWithOptionalChildren extends NavItem {
  items?: NavItemWithChildren[];
}

export interface FooterItem {
  title: string;
  items: {
    title: string;
    href: string;
    external?: boolean;
  }[];
}

export type MainNavItem = NavItemWithOptionalChildren;

export type SidebarNavItem = NavItemWithChildren;
