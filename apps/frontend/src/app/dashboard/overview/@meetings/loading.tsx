import {
  Card,
  CardContent,
  CardHeader
} from '@ringee/frontend-shared/components/ui/card';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';

export default function MeetingsLoading() {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <Skeleton className='h-4 w-32' />
      </CardHeader>
      <CardContent>
        <Skeleton className='h-8 w-12' />
        <div className='mt-3 space-y-2'>
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-3/4' />
        </div>
      </CardContent>
    </Card>
  );
}
