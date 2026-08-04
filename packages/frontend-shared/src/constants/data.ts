import { NavItem } from "../types";

export type Product = {
  photo_url: string;
  name: string;
  description: string;
  created_at: string;
  price: number;
  id: number;
  category: string;
  updated_at: string;
};

export interface NavGroup {
  label: string;
  items: NavItem[];
}

//Info: The following data is used for the sidebar navigation and Cmd K bar.
export const navGroups: NavGroup[] = [
  {
    label: "General",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard/overview",
        icon: "dashboard",
        isActive: false,
        shortcut: ["d", "d"],
        items: [],
      },
      {
        title: "Call",
        url: "/dashboard/call",
        icon: "phoneCall",
        shortcut: ["c", "c"],
        isActive: false,
        items: [],
      },
      {
        title: "Contacts",
        url: "/dashboard/contact",
        icon: "user",
        shortcut: ["c", "t"],
        isActive: false,
        items: [],
      },
      {
        title: "Activities",
        url: "/dashboard/activities",
        icon: "activity",
        shortcut: ["a", "c"],
        isActive: false,
        items: [],
      },
      // {
      //   title: 'Ringee AI',
      //   url: '/dashboard/ai',
      //   icon: 'sparkles',
      //   shortcut: ['a', 'i'],
      //   isActive: false,
      //   items: []
      // },
      {
        title: "Meetings",
        url: "/dashboard/meetings",
        icon: "calendarCheck",
        shortcut: ["m", "m"],
        isActive: false,
        items: [],
      },
    ],
  },
  // Temporarily hidden until messaging works reliably. "Call" moved to General.
  // Restore this group (and the Inbox unread badge in app-sidebar.tsx) when the
  // Inbox is ready — the /dashboard/inbox route still exists.
  // {
  //   label: "Communication",
  //   items: [
  //     {
  //       title: "Inbox",
  //       url: "/dashboard/inbox",
  //       icon: "inbox",
  //       shortcut: ["i", "b"],
  //       isActive: false,
  //       items: [],
  //     },
  //   ],
  // },
  {
    label: "Outreach",
    items: [
      {
        title: "Campaigns",
        url: "/dashboard/campaigns",
        icon: "target",
        shortcut: ["c", "a"],
        isActive: false,
        items: [],
      },
      {
        title: "Callbacks",
        url: "/dashboard/callbacks",
        icon: "phoneIncoming",
        shortcut: ["c", "b"],
        isActive: false,
        items: [],
      },
      {
        title: "DNC",
        url: "/dashboard/dnc",
        icon: "shieldOff",
        shortcut: ["d", "n"],
        isActive: false,
        items: [],
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        title: "AI Pipeline",
        url: "/dashboard/ai-pipeline",
        icon: "sparkles",
        shortcut: ["a", "p"],
        adminOnly: true,
        isActive: false,
        items: [],
      },
      {
        title: "AI Agents",
        url: "/dashboard/ai",
        icon: "activity",
        shortcut: ["a", "i"],
        isActive: false,
        items: [],
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "Overview",
        url: "/dashboard/settings/overview",
        icon: "settings",
        shortcut: ["s", "o"],
        isActive: false,
        items: [],
      },
      {
        title: "Integrations",
        url: "/dashboard/settings/integrations",
        icon: "plug",
        shortcut: ["i", "n"],
        isActive: false,
        items: [],
      },
    ],
  },
];

// Legacy flat list derived from groups (for backward compatibility)
export const navItems: NavItem[] = navGroups.flatMap((g) => g.items);

export interface SaleUser {
  id: number;
  name: string;
  email: string;
  amount: string;
  image: string;
  initials: string;
}

export const recentSalesData: SaleUser[] = [
  {
    id: 1,
    name: "Olivia Martin",
    email: "olivia.martin@email.com",
    amount: "+$1,999.00",
    image: "https://api.slingacademy.com/public/sample-users/1.png",
    initials: "OM",
  },
  {
    id: 2,
    name: "Jackson Lee",
    email: "jackson.lee@email.com",
    amount: "+$39.00",
    image: "https://api.slingacademy.com/public/sample-users/2.png",
    initials: "JL",
  },
  {
    id: 3,
    name: "Isabella Nguyen",
    email: "isabella.nguyen@email.com",
    amount: "+$299.00",
    image: "https://api.slingacademy.com/public/sample-users/3.png",
    initials: "IN",
  },
  {
    id: 4,
    name: "William Kim",
    email: "will@email.com",
    amount: "+$99.00",
    image: "https://api.slingacademy.com/public/sample-users/4.png",
    initials: "WK",
  },
  {
    id: 5,
    name: "Sofia Davis",
    email: "sofia.davis@email.com",
    amount: "+$39.00",
    image: "https://api.slingacademy.com/public/sample-users/5.png",
    initials: "SD",
  },
];
