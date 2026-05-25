'use client';

import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';

export function SessionLoadingView() {
  return (
    <div className="flex h-[100dvh] flex-col">
      <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="ml-auto h-5 w-24 rounded-full" />
      </div>
      <div className="grid flex-1 grid-cols-1 gap-0 md:grid-cols-3">
        <div className="border-r p-4">
          <Skeleton className="mb-3 h-12 w-12 rounded-full" />
          <Skeleton className="mb-2 h-4 w-32" />
          <Skeleton className="h-3 w-24" />
          <div className="mt-6 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="flex items-center justify-center border-r">
          <Skeleton className="h-40 w-40 rounded-xl" />
        </div>
        <div className="p-4">
          <Skeleton className="mb-3 h-4 w-32" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
