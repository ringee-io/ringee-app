'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconTopologyStar3 } from '@tabler/icons-react';
import { RESOURCE_META, addResourceOptions } from '../lib/node-config';
import type { InfrastructureResourceType } from '../types';

export function EmptyState({
  hasOrg,
  onAdd
}: {
  hasOrg: boolean;
  onAdd: (type: InfrastructureResourceType) => void;
}) {
  const options = addResourceOptions(hasOrg);

  return (
    <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6'>
      <div className='bg-card/70 pointer-events-auto max-w-md rounded-2xl border p-8 text-center shadow-xl backdrop-blur-md'>
        <div className='bg-primary/10 text-primary ring-primary/10 mx-auto flex size-12 items-center justify-center rounded-xl ring-1'>
          <IconTopologyStar3 className='size-6' />
        </div>
        <h2 className='mt-4 text-lg font-semibold'>
          Build your calling architecture
        </h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          {hasOrg
            ? 'Add team members, phone numbers, SIP devices and campaigns, then connect them — right-click the canvas or use Add resource.'
            : 'Add phone numbers and SIP devices, then connect them — right-click the canvas or use Add resource.'}
        </p>
        <div className='mt-5 flex flex-wrap justify-center gap-2'>
          {options.map((opt) => {
            const meta = RESOURCE_META[opt.type];
            const Icon = meta.Icon;
            return (
              <Button
                key={opt.type}
                size='sm'
                variant='outline'
                onClick={() => onAdd(opt.type)}
              >
                <span
                  className={cn(
                    'flex size-4 items-center justify-center rounded',
                    meta.badge
                  )}
                >
                  <Icon className='size-3' />
                </span>
                {meta.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
