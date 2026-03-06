'use client';

import * as React from 'react';
import { MemberSelector } from './member-selector';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { useSearchParams, useRouter } from 'next/navigation';
import { useOrganization } from '@clerk/nextjs';

export function DashboardHeader() {
  const { isOrgAdmin, hasOrg, isLoaded } = useOrgRole();
  const { organization } = useOrganization();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const memberId = searchParams.get('memberId');
  const memberName = searchParams.get('memberName');

  const handleMemberChange = React.useCallback((newMemberId: string | null, newMemberName: string | null) => {
    const url = new URL(window.location.href);
    if (newMemberId && newMemberName) {
      url.searchParams.set('memberId', newMemberId);
      url.searchParams.set('memberName', newMemberName);
    } else {
      url.searchParams.delete('memberId');
      url.searchParams.delete('memberName');
    }
    router.push(url.pathname + url.search);
    router.refresh();
  }, [router]);

  if (!isLoaded || !hasOrg || !isOrgAdmin) {
    return (
      <div className='flex items-center justify-between'>
        <h2 className='text-2xl font-bold tracking-tight'>Hi, Welcome 👋</h2>
      </div>
    );
  }

  const title = memberName 
    ? `${memberName} Analytics 📊`
    : 'Organization Analytics 📊';

  return (
    <div className='flex items-center justify-between'>
      <h2 className='text-2xl font-bold tracking-tight'>{title}</h2>
      <MemberSelector 
        key={organization?.id || 'no-org'}
        value={memberId} 
        onChange={handleMemberChange} 
      />
    </div>
  );
}
