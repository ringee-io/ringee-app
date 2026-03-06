import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from '@ringee/frontend-shared/components/ui/card';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';

export function OverviewCardsSkeleton() {
  return (
    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className='@container/card'>
          {/* Header */}
          <CardHeader>
            <CardDescription>
              <Skeleton className='h-4 w-[120px]' />
            </CardDescription>
            <CardTitle>
              <Skeleton className='h-8 w-[100px]' />
            </CardTitle>
            <div className='mt-2'>
              <Skeleton className='h-5 w-[80px] rounded-md' />
            </div>
          </CardHeader>

          {/* Footer */}
          <CardFooter className='flex-col items-start gap-2 text-sm'>
            <div className='flex items-center gap-2'>
              <Skeleton className='h-3 w-[150px]' />
              <Skeleton className='h-4 w-4 rounded-full' />
            </div>
            <Skeleton className='h-3 w-[180px]' />
            <div className='flex gap-3 pt-2'>
              <Skeleton className='h-5 w-[100px] rounded-md' />
              <Skeleton className='h-5 w-[100px] rounded-md' />
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
