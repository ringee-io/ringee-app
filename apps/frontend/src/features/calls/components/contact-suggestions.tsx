'use client';

import { Card } from '@ringee/frontend-shared/components/ui/card';
import { Avatar, AvatarFallback } from '@ringee/frontend-shared/components/ui/avatar';

export function ContactSuggestions({
  matches,
  maxHeight = '180px'
}: {
  matches: { id: number; name: string; phone: string }[];
  maxHeight?: string;
}) {
  if (matches.length === 0) return null;
  return (
    <Card
      className='w-full border-dashed p-3'
      style={{ maxHeight, overflowY: 'auto' }}
    >
      <h3 className='text-muted-foreground mb-2 text-sm font-medium'>
        Matching Contacts
      </h3>
      <div className='space-y-2'>
        {matches.map((c) => (
          <div
            key={c.id}
            className='hover:bg-muted flex cursor-pointer items-center justify-between rounded-md px-2 py-1'
          >
            <div className='flex items-center gap-2'>
              <Avatar className='h-7 w-7'>
                <AvatarFallback>{c.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className='flex flex-col leading-tight'>
                <span className='text-sm font-medium'>{c.name}</span>
                <span className='text-muted-foreground text-xs'>{c.phone}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
