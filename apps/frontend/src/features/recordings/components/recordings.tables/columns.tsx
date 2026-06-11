'use client';

import { DataTableColumnHeader } from '@ringee/frontend-shared/components/ui/table/data-table-column-header';
import { ColumnDef, Column } from '@tanstack/react-table';
import {
  Clock,
  PhoneIncoming,
  PhoneOutgoing,
  Download,
  Calendar,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import Link from 'next/link';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { RecordingPlayButton } from './recording-play-button';
import { useTranslations } from 'next-intl';
import { CallTranscriptionActions } from '@/features/transcription';

type RecordingData = {
  id: string;
  url: string | null;
  format: string | null;
  status: string | null;
};

type CallWithRecordings = {
  id: string;
  fromNumber: string;
  toNumber: string;
  direction: 'inbound' | 'outbound';
  status: string;
  durationSeconds: number;
  startedAt: string | null;
  recordings: RecordingData[];
  contact?: { name?: string | null };
};

type StatusKey = 'started' | 'completed' | 'failed' | 'processing';

const statusConfig: Record<
  string,
  {
    key: StatusKey;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: typeof CheckCircle2;
  }
> = {
  started: { key: 'started', variant: 'secondary', icon: Loader2 },
  completed: { key: 'completed', variant: 'default', icon: CheckCircle2 },
  failed: { key: 'failed', variant: 'destructive', icon: AlertCircle },
  processing: { key: 'processing', variant: 'secondary', icon: Loader2 }
};

export const columns: ColumnDef<CallWithRecordings>[] = [
  {
    accessorKey: 'direction',
    header: ({ column }: { column: Column<CallWithRecordings, unknown> }) => {
      const t = useTranslations('calls.recordings.table');
      return <DataTableColumnHeader column={column} title={t('type')} />;
    },
    cell: ({ row }) => {
      const direction = row.original.direction;
      const Icon = direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;

      return (
        <div className='flex w-full items-center gap-2 sm:w-[50%]'>
          <Icon
            className={cn(
              'h-4 w-4',
              direction === 'inbound' ? 'text-green-500' : 'text-blue-500'
            )}
          />
          <span className='capitalize'>{direction}</span>
        </div>
      );
    }
  },
  {
    accessorKey: 'contact.name',
    header: ({ column }: { column: Column<CallWithRecordings, unknown> }) => {
      const t = useTranslations('calls.recordings.table');
      return <DataTableColumnHeader column={column} title={t('contact')} />;
    },
    cell: ({ row }) => {
      const t = useTranslations('calls.recordings.table');
      const unknown = t('unknown');
      const name = row.original.contact?.name || unknown;
      return name !== unknown ? (
        <Link
          href={`/dashboard/call?tab=contact&name=${row.original.toNumber}`}
          className='text-foreground font-medium'
        >
          {name}
        </Link>
      ) : (
        <span className='text-muted-foreground font-medium'>{name}</span>
      );
    }
  },
  {
    accessorKey: 'fromNumber',
    header: () => {
      const t = useTranslations('calls.recordings.table');
      return <>{t('from')}</>;
    },
    cell: ({ cell }) => (
      <span className='text-muted-foreground font-mono text-sm'>
        {cell.getValue<string>()}
      </span>
    )
  },
  {
    accessorKey: 'toNumber',
    header: () => {
      const t = useTranslations('calls.recordings.table');
      return <>{t('to')}</>;
    },
    cell: ({ cell }) => (
      <span className='text-muted-foreground font-mono text-sm'>
        {cell.getValue<string>()}
      </span>
    )
  },
  {
    accessorKey: 'durationSeconds',
    header: () => {
      const t = useTranslations('calls.recordings.table');
      return <>{t('duration')}</>;
    },
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
    header: ({ column }: { column: Column<CallWithRecordings, unknown> }) => {
      const t = useTranslations('calls.recordings.table');
      return <DataTableColumnHeader column={column} title={t('date')} />;
    },
    cell: ({ cell }) => {
      const date = cell.getValue<string>();
      if (!date) return '—';
      const d = new Date(date);
      return (
        <div className='text-muted-foreground flex items-center gap-1 text-xs'>
          <Calendar className='h-3.5 w-3.5' />
          {d.toLocaleDateString()}{' '}
          {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      );
    }
  },
  {
    id: 'recordingStatus',
    header: () => {
      const t = useTranslations('calls.recordings.table');
      return <>{t('status')}</>;
    },
    cell: ({ row }) => {
      const t = useTranslations('calls.recordings.table');
      const tBadge = useTranslations('calls.recordings.statusBadge');
      const recordings = row.original.recordings || [];
      if (recordings.length === 0) {
        return (
          <span className='text-muted-foreground text-xs'>
            {t('noRecording')}
          </span>
        );
      }

      const recording = recordings[0];
      const status = recording.status || 'started';
      const config = statusConfig[status] || statusConfig.started;
      const StatusIcon = config.icon;

      return (
        <Badge variant={config.variant} className='gap-1'>
          <StatusIcon
            className={cn(
              'h-3 w-3',
              status === 'started' || status === 'processing'
                ? 'animate-spin'
                : ''
            )}
          />
          {tBadge(config.key)}
        </Badge>
      );
    }
  },
  {
    id: 'recording',
    header: () => {
      const t = useTranslations('calls.recordings.table');
      return <>{t('recording')}</>;
    },
    cell: ({ row }) => {
      const t = useTranslations('calls.recordings.table');
      const recordings = row.original.recordings || [];
      if (recordings.length === 0) {
        return <span className='text-muted-foreground text-xs'>—</span>;
      }

      const recording = recordings[0];
      const recordingUrl = recording.url;
      const status = recording.status || 'started';

      if (status !== 'completed' || !recordingUrl) {
        return (
          <span className='text-muted-foreground text-xs'>
            {status === 'started' || status === 'processing'
              ? t('processingShort')
              : t('unavailable')}
          </span>
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
            <TooltipContent>{t('downloadRecording')}</TooltipContent>
          </Tooltip>
        </div>
      );
    }
  },
  {
    id: 'transcript',
    header: () => {
      const t = useTranslations('calls.recordings.table');
      return <>{t('transcript')}</>;
    },
    cell: ({ row }) => <CallTranscriptionActions callId={row.original.id} />
  }
];
