'use client';

import { DataTableColumnHeader } from '@ringee/frontend-shared/components/ui/table/data-table-column-header';
import { ColumnDef, Column } from '@tanstack/react-table';
import {
  Clock,
  PhoneIncoming,
  PhoneOutgoing,
  PlayCircle,
  Phone,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { useQuickDialerCall } from '@/features/calls/hooks/use.quick.dialer.call';
import { RecordingPlayButton } from '@/features/recordings/components/recordings.tables/recording-play-button';

type RecordingData = {
  id: string;
  url: string | null;
  format: string | null;
  status: string | null;
};

type Call = {
  id: string;
  fromNumber: string;
  toNumber: string;
  direction: 'inbound' | 'outbound';
  status: string;
  durationSeconds: number;
  startedAt: string | null;
  recordings?: RecordingData[];
  contact?: { name?: string | null };
};

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }
> = {
  started: {
    label: 'Processing',
    variant: 'secondary',
    icon: Loader2
  },
  completed: {
    label: 'Ready',
    variant: 'default',
    icon: CheckCircle2
  },
  failed: {
    label: 'Failed',
    variant: 'destructive',
    icon: AlertCircle
  },
  processing: {
    label: 'Processing',
    variant: 'secondary',
    icon: Loader2
  }
};

export const columns: ColumnDef<Call>[] = [
  {
    accessorKey: 'direction',
    header: ({ column }: { column: Column<Call, unknown> }) => (
      <DataTableColumnHeader column={column} title='Type' />
    ),
    cell: ({ row }) => {
      const direction = row.original.direction;
      const Icon = direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;
      const phoneNumber = direction === 'inbound' ? row.original.fromNumber : row.original.toNumber;

      const { isQuickDialerOpen, handleRecall } = useQuickDialerCall();

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='ghost'
              className='border-b border-blue-500'
              onClick={() => handleRecall(phoneNumber)}
            >
              <div className='flex w-full items-center gap-2 sm:w-[50%]'>
                <Icon
                  className={cn(
                    'h-4 w-4',
                    direction === 'inbound'
                      ? 'text-green-500'
                      : 'text-blue-500'
                  )}
                />
                <span className='capitalize'>{direction}</span>
              </div>
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side='top'
            align='center'
            className='flex items-center gap-2'
          >
            <Phone className='h-4 w-4' />
            <span>Call again</span>
          </TooltipContent>
        </Tooltip>
      );
    }
  },
  {
    accessorKey: 'contact.name',
    header: ({ column }: { column: Column<Call, unknown> }) => (
      <DataTableColumnHeader column={column} title='Contact' />
    ),
    cell: ({ row }) => {
      const name = row.original.contact?.name || 'Unknown';
      const phoneNumber = row.original.direction === 'inbound' ? row.original.fromNumber : row.original.toNumber;
      const { handleRecall } = useQuickDialerCall();

      return name !== 'Unknown' ? (
        <Button
          variant='link'
          className='text-foreground p-0 font-medium'
          onClick={() => handleRecall(phoneNumber)}
        >
          {name}
        </Button>
      ) : (
        <span className='text-muted-foreground font-medium'>{name}</span>
      );
    }
  },
  {
    accessorKey: 'fromNumber',
    header: 'From',
    cell: ({ cell }) => (
      <span className='text-muted-foreground font-mono text-sm'>
        {cell.getValue<string>()}
      </span>
    )
  },
  {
    accessorKey: 'toNumber',
    header: 'To',
    cell: ({ cell }) => (
      <span className='text-muted-foreground font-mono text-sm'>
        {cell.getValue<string>()}
      </span>
    )
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.status;
      const statusMap: Record<string, string> = {
        pending: 'bg-yellow-100 text-yellow-800',
        ringing: 'bg-yellow-100 text-yellow-800',
        answered: 'bg-green-100 text-green-800',
        recording: 'bg-blue-100 text-blue-800',
        completed: 'bg-emerald-100 text-emerald-800',
        failed: 'bg-red-100 text-red-800'
      };

      return (
        <Badge
          variant='outline'
          className={cn(
            'border-none font-medium capitalize',
            statusMap[status] || 'bg-muted text-muted-foreground'
          )}
        >
          {status}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'durationSeconds',
    header: 'Duration',
    cell: ({ cell }) => {
      const seconds = cell.getValue<number>();
      if (!seconds) return '-';

      const minutes = Math.floor(seconds / 60);
      const remaining = seconds % 60;
      return (
        <div className='text-muted-foreground flex items-center gap-1 text-sm'>
          <Clock className='h-3.5 w-3.5' />
          {minutes}:{remaining.toString().padStart(2, '0')} min
        </div>
      );
    }
  },
  {
    accessorKey: 'startedAt',
    header: 'Date',
    cell: ({ cell }) => {
      const date = cell.getValue<string>();
      if (!date) return '—';
      const d = new Date(date);
      return (
        <span className='text-muted-foreground text-xs'>
          {d.toLocaleDateString()}{' '}
          {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      );
    }
  },
  {
    id: 'recording',
    header: 'Recording',
    cell: ({ row }) => {
      const recordings = row.original.recordings || [];
      
      if (recordings.length === 0) {
        return (
          <span className='text-muted-foreground text-xs'>No recording</span>
        );
      }

      const recording = recordings[0];
      const recordingUrl = recording.url;
      const status = recording.status || 'started';

      // Show status badge if not completed
      if (status !== 'completed' || !recordingUrl) {
        const config = statusConfig[status] || statusConfig.started;
        const StatusIcon = config.icon;

        return (
          <Badge variant={config.variant} className='gap-1'>
            <StatusIcon
              className={cn(
                'h-3 w-3',
                status === 'started' || status === 'processing' ? 'animate-spin' : ''
              )}
            />
            {config.label}
          </Badge>
        );
      }

      return (
        <div className='flex items-center gap-2'>
          <RecordingPlayButton
            recordingUrl={recordingUrl}
            callFrom={row.original.fromNumber}
            callTo={row.original.toNumber}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size='sm' variant='ghost' asChild>
                <a href={recordingUrl} download>
                  <Download className='h-4 w-4' />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download recording</TooltipContent>
          </Tooltip>
        </div>
      );
    }
  }
];
