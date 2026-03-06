'use client';

import React from 'react';
import { SidebarTrigger } from '@ringee/frontend-shared/components/ui/sidebar';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Breadcrumbs } from '@ringee/frontend-shared/components/breadcrumbs';
import SearchInput from '@ringee/frontend-shared/components/search-input';
import { UserNav } from './user-nav';
import { ThemeSelector } from '@ringee/frontend-shared/components/theme-selector';
import { ModeToggle } from './ThemeToggle/theme-toggle';
import { CreditPopover } from '@/features/credit/components/credit.popover';
import { useIsMobile } from '@ringee/frontend-shared/hooks/use-mobile';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';

export default function Header({ useMock }: { useMock?: boolean }) {
  const mobile = useIsMobile();
  const { canAccessAdminFeatures } = useMock
    ? { canAccessAdminFeatures: true }
    : useOrgRole();

  return (
    <header className='flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12'>
      {!mobile && (
        <div className='hidden items-center gap-2 px-4 sm:flex'>
          <SidebarTrigger className='-ml-1' />
          <Separator orientation='vertical' className='mr-2 h-4' />
          <Breadcrumbs />
        </div>
      )}

      {mobile && canAccessAdminFeatures && (
        <div className='pl-4'>
          <CreditPopover useMock={useMock} />
        </div>
      )}

      <div className='flex items-center gap-2 px-4'>
        {!mobile && canAccessAdminFeatures && <CreditPopover useMock={useMock} />}
        <div className='hidden sm:flex'>
          <SearchInput />
        </div>
        <UserNav useMock={useMock} />
        <ModeToggle />
        <ThemeSelector />
      </div>
    </header>
  );
}
