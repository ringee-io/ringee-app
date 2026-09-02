'use client';

import { DataTableColumnHeader } from '@ringee/frontend-shared/components/ui/table/data-table-column-header';
import { ColumnDef, Column } from '@tanstack/react-table';
import {
  Clock,
  PhoneIncoming,
  PhoneOutgoing,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useTranslations } from 'next-intl';
// Imported from the modules themselves, not the feature barrel: the barrel
// re-exports the detail screen, and pulling that into the history bundle would
// ship the whole page to a route that only renders a badge.
import { CallSourceBadge } from '@/features/call-detail/components/call-source-badge';
import type {
  CallListAgentRef,
  CallSource
} from '@/features/call-detail/types';
import { HistoryCallRowActions } from '../call-history-detail-dialog';

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
  /** Origin channel. Null on rows that predate the column (web dialer). */
  source?: CallSource;
  /** Present only on a call an AI voice agent placed. */
  aiVoiceAgentCall?: CallListAgentRef | null;
};

const statusConfig: Record<
  string,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: typeof CheckCircle2;
  }
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
    header: ({ column }: { column: Column<Call, unknown> }) => {
      const t = useTranslations('calls.history.table');
      return <DataTableColumnHeader column={column} title={t('type')} />;
    },
    cell: ({ row }) => {
      const direction = row.original.direction;
      const Icon = direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;

      return (
        <div className='flex items-center gap-2'>
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
    header: ({ column }: { column: Column<Call, unknown> }) => {
      const t = useTranslations('calls.history.table');
      return <DataTableColumnHeader column={column} title={t('contact')} />;
    },
    cell: ({ row }) => {
      const t = useTranslations('calls.history.table');
      const name = row.original.contact?.name || t('unknown');

      return name !== t('unknown') ? (
        <span className='text-foreground font-medium'>{name}</span>
      ) : (
        <span className='text-muted-foreground font-medium'>{name}</span>
      );
    }
  },
  {
    accessorKey: 'fromNumber',
    header: () => {
      const t = useTranslations('calls.history.table');
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
      const t = useTranslations('calls.history.table');
      return <>{t('to')}</>;
    },
    cell: ({ cell }) => (
      <span className='text-muted-foreground font-mono text-sm'>
        {cell.getValue<string>()}
      </span>
    )
  },
  {
    id: 'source',
    header: () => {
      const t = useTranslations('calls.history.table');
      return <>{t('source')}</>;
    },
    // How the call was placed, and by which agent when an agent placed it.
    // A workspace running agents alongside people needs to tell the two apart
    // in the list, not by opening rows one at a time.
    cell: ({ row }) => (
      <CallSourceBadge
        source={row.original.source ?? null}
        agentName={row.original.aiVoiceAgentCall?.agent?.name}
      />
    )
  },
  {
    accessorKey: 'status',
    header: () => {
      const t = useTranslations('calls.history.table');
      return <>{t('status')}</>;
    },
    cell: ({ row }) => {
      const t = useTranslations('calls.statusValues');
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
          {t(status as any) || status}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'durationSeconds',
    header: () => {
      const t = useTranslations('calls.history.table');
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
    header: () => {
      const t = useTranslations('calls.history.table');
      return <>{t('date')}</>;
    },
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
    header: () => {
      const t = useTranslations('calls.history.table');
      return <>{t('recording')}</>;
    },
    cell: ({ row }) => {
      const t = useTranslations('calls.history.table');
      const tStatus = useTranslations('calls.statusValues');
      const recordings = row.original.recordings || [];

      if (recordings.length === 0) {
        return (
          <span className='text-muted-foreground text-xs'>
            {t('noRecording')}
          </span>
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
                status === 'started' || status === 'processing'
                  ? 'animate-spin'
                  : ''
              )}
            />
            {tStatus(status as any) || config.label}
          </Badge>
        );
      }

      const config = statusConfig.completed;
      const StatusIcon = config.icon;
      return (
        <Badge variant={config.variant} className='gap-1'>
          <StatusIcon className='h-3 w-3' />
          {tStatus('completed' as any) || config.label}
        </Badge>
      );
    }
  },
  {
    id: 'actions',
    size: 160,
    minSize: 160,
    header: () => {
      const t = useTranslations('tables.headers');
      return <span className='sr-only'>{t('actions')}</span>;
    },
    cell: ({ row }) => {
      const recordingUrl = row.original.recordings?.[0]?.url;
      const phoneNumber =
        row.original.direction === 'inbound'
          ? row.original.fromNumber
          : row.original.toNumber;
      return (
        <HistoryCallRowActions
          callId={row.original.id}
          recordingUrl={recordingUrl}
          callFrom={row.original.fromNumber}
          callTo={row.original.toNumber}
          phoneNumber={phoneNumber}
        />
      );
    }
  }
];
