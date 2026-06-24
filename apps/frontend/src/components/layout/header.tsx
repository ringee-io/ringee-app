'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { SidebarTrigger } from '@ringee/frontend-shared/components/ui/sidebar';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Breadcrumbs } from '@ringee/frontend-shared/components/breadcrumbs';
import { Button } from '@ringee/frontend-shared/components/ui/button';
// import SearchInput from '@ringee/frontend-shared/components/search-input';
import { UserNav } from './user-nav';
import { CommunitySupportButton } from './community-support-button';
import { CreditPopover } from '@/features/credit/components/credit.popover';
import { useIsMobile } from '@ringee/frontend-shared/hooks/use-mobile';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { HeaderOnboardingButton } from '@/features/onboarding/components/header-onboarding-button';
import { usePendingActionsBadge } from '@/features/pending-actions/hooks/use-pending-actions-badge';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Icons } from '@ringee/frontend-shared/components/icons';
import { NumberRotationHeaderButton } from '@/features/number-rotation';

export default function Header({ useMock }: { useMock?: boolean }) {
  const router = useRouter();
  const mobile = useIsMobile();
  const pendingActionsBadge = usePendingActionsBadge();
  const { canAccessAdminFeatures } = useMock
    ? { canAccessAdminFeatures: true }
    : useOrgRole();

  return (
    <header className='flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12'>
      <div className='flex min-w-0 items-center gap-2 px-2 sm:px-4'>
        <SidebarTrigger className='-ml-1 shrink-0' />
        {!mobile && (
          <>
            <Separator orientation='vertical' className='mr-2 h-4' />
            <Breadcrumbs />
          </>
        )}
      </div>

      <div className='flex items-center gap-2 px-2 sm:gap-4 sm:px-4'>
        {!mobile && <CommunitySupportButton />}
        <Button
          onClick={() => router.push('/dashboard/pending-actions')}
          variant={mobile ? 'ghost' : 'link'}
          size={mobile ? 'icon' : 'sm'}
          className={cn(
            'cursor-pointer',
            mobile ? 'relative h-8 w-8 p-0' : 'gap-1.5'
          )}
          aria-label='Pending Actions'
        >
          {/* @ts-ignore */}
          <Icons.check
            size={15}
            className={cn(
              pendingActionsBadge > 0 && 'text-amber-600 dark:text-amber-300'
            )}
          />
          {!mobile && (
            <span
              className={cn(
                'text-xs font-semibold',
                pendingActionsBadge > 0 && 'text-amber-700 dark:text-amber-300'
              )}
            >
              Pending Actions
            </span>
          )}
          {pendingActionsBadge > 0 && (
            <span
              className={cn(
                'bg-amber-500 font-bold tracking-wide text-amber-950',
                mobile
                  ? 'absolute -top-1 -right-1 rounded-full px-1 py-0 text-[8px]'
                  : 'rounded-md px-1.5 py-0.5 text-[9px]'
              )}
            >
              {pendingActionsBadge > 99 ? '99+' : pendingActionsBadge}
            </span>
          )}
        </Button>
        {canAccessAdminFeatures && <NumberRotationHeaderButton />}
        {canAccessAdminFeatures && <CreditPopover useMock={useMock} />}
        {/* <div className='hidden sm:flex'>
          <SearchInput />
        </div> */}
        <UserNav useMock={useMock} />
        {!mobile && <HeaderOnboardingButton />}
      </div>
    </header>
  );
}
