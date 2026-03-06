'use client';

import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription
} from '@ringee/frontend-shared/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { IconHistory } from '@tabler/icons-react';
import { useQuickDialerCall } from '@/features/calls/hooks/use.quick.dialer.call';

type Call = {
  id: string;
  contact?: {
    name?: string | null;
    email?: string | null;
  } | null;
  fromNumber: string;
  toNumber: string;
  totalCost?: number | null;
  durationSeconds?: number | null;
  createdAt: string;
  status: string;
};

interface RecentSalesProps {
  data: Call[];
}

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds < 0) return '—';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function RecentSales({ data }: RecentSalesProps) {
  const { handleRecall } = useQuickDialerCall();
  return (
    <Card className='h-full'>
      <CardHeader>
        <CardTitle>Recent Calls</CardTitle>
        <CardDescription>Last {data?.length || 0} calls</CardDescription>
      </CardHeader>
      <CardContent>
        {data?.length ? (
          <div className='space-y-8'>
            {data.map((call) => {
              const name = call.contact?.name || call.toNumber;
              const email = `From: ${call.fromNumber} → To: ${call.toNumber}`;

              const duration = formatDuration(call.durationSeconds);

              return (
                <div key={call.id} className='flex items-center'>
                  <div
                    key={call.id}
                    className='cursor-pointer'
                    onClick={() => handleRecall(call.toNumber)}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <IconHistory className='text-muted-foreground hover:text-primary h-9 w-9 transition-colors' />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Call {call.toNumber} again</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <div className='ml-4 space-y-1'>
                    <p className='text-sm leading-none font-medium'>{name}</p>
                    <p className='text-muted-foreground text-sm'>{email}</p>
                  </div>

                  <div className='text-muted-foreground ml-auto font-medium'>
                    {duration}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className='text-muted-foreground text-sm'>
            No recent calls found.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
