import { Icons } from "../components/icons";

export interface NavItem {
  title: string;
  url: string;
  /** Hidden from org members; visible to org admins and freelancers (no org). */
  adminOnly?: boolean;
  /** Available only while an organization workspace is active. */
  organizationOnly?: boolean;
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
