import React from 'react';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';

export default function PageContainer({
  children,
  scrollable = true
}: {
  children: React.ReactNode;
  scrollable?: boolean;
}) {
  return (
    <>
      {scrollable ? (
        <ScrollArea className='h-[calc(100dvh-52px)]'>
          <div className='mb-24 flex flex-1 p-4 md:mb-0 md:px-6'>
            {children}
          </div>
        </ScrollArea>
      ) : (
        <div className='flex flex-1 p-4 md:px-6'>{children}</div>
      )}
    </>
  );
}
