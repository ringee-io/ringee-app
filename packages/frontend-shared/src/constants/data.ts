import { NavItem } from '../types';

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

//Info: The following data is used for the sidebar navigation and Cmd K bar.
export const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    url: '/dashboard/overview',
    icon: 'dashboard',
    isActive: false,
    shortcut: ['d', 'd'],
    items: [] // Empty array as there are no child items for Dashboard
  },
  {
    title: 'Call',
    url: '/dashboard/call',
    icon: 'phoneCall',
    shortcut: ['c', 'c'],
    isActive: false,
    items: [] // No child items
  },
  {
    title: 'Contacts',
    url: '/dashboard/contact',
    icon: 'user',
    shortcut: ['c', 't'],
    isActive: false,
    items: [] // No child items
  },
  // {
  //   title: 'Board',
  //   url: '/dashboard/kanban',
  //   icon: 'kanban',
  //   shortcut: ['k', 'k'],
  //   isActive: false,
  //   items: [] // No child items
  // },
  {
    title: 'More',
    url: '#',
    icon: 'moreHorizontal',
    isActive: true,
    items: [
      {
        title: 'Profile',
        url: '/dashboard/profile',
        icon: 'userPen',
        shortcut: ['p', 'p'],
        isActive: false,
        items: [] // No child items
      },
      {
        title: 'Rate',
        url: '/dashboard/rate',
        icon: 'star',
        shortcut: ['r', 'r'],
        isActive: false,
        items: [] // No child items
      },
      {
        title: 'Buy Number',
        url: '/dashboard/buy-number',
        icon: 'phoneCall',
        shortcut: ['b', 'n'],
        isActive: false,
        items: [] // No child items
      },
      {
        title: 'Recordings',
        url: '/dashboard/recordings',
        icon: 'mic',
        shortcut: ['r', 'c'],
        isActive: false,
        items: [] // No child items
      },
      {
        title: 'History',
        url: '/dashboard/history',
        icon: 'history',
        shortcut: ['c', 'h'],
        isActive: false,
        items: []
      }
    ]
  }
];

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
    name: 'Olivia Martin',
    email: 'olivia.martin@email.com',
    amount: '+$1,999.00',
    image: 'https://api.slingacademy.com/public/sample-users/1.png',
    initials: 'OM'
  },
  {
    id: 2,
    name: 'Jackson Lee',
    email: 'jackson.lee@email.com',
    amount: '+$39.00',
    image: 'https://api.slingacademy.com/public/sample-users/2.png',
    initials: 'JL'
  },
  {
    id: 3,
    name: 'Isabella Nguyen',
    email: 'isabella.nguyen@email.com',
    amount: '+$299.00',
    image: 'https://api.slingacademy.com/public/sample-users/3.png',
    initials: 'IN'
  },
  {
    id: 4,
    name: 'William Kim',
    email: 'will@email.com',
    amount: '+$99.00',
    image: 'https://api.slingacademy.com/public/sample-users/4.png',
    initials: 'WK'
  },
  {
    id: 5,
    name: 'Sofia Davis',
    email: 'sofia.davis@email.com',
    amount: '+$39.00',
    image: 'https://api.slingacademy.com/public/sample-users/5.png',
    initials: 'SD'
  }
];
