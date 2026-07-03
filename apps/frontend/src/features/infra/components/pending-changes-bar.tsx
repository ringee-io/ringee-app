'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { IconGitBranch } from '@tabler/icons-react';

/**
 * Scaffold for the future staged-changes flow. For the MVP changes are applied
 * immediately, so this only surfaces how many draft (not-yet-applied) links
 * exist. Review / Apply / Discard are intentionally disabled for now.
 */
export function PendingChangesBar({ draftCount }: { draftCount: number }) {
  if (draftCount === 0) return null;
  return (
    <div className='absolute top-3 left-1/2 z-20 -translate-x-1/2'>
      <div className='bg-card/90 flex items-center gap-2 rounded-full border py-1.5 pr-1.5 pl-3 shadow-md backdrop-blur'>
        <IconGitBranch className='size-3.5 text-amber-400' />
        <span className='text-xs font-medium'>
          {draftCount} draft {draftCount === 1 ? 'link' : 'links'} not applied
        </span>
        <Button size='sm' variant='ghost' className='h-6 px-2 text-xs' disabled>
          Review
        </Button>
      </div>
    </div>
  );
}
