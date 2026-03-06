'use client';

import { DataTableColumnHeader } from '@ringee/frontend-shared/components/ui/table/data-table-column-header';
import { ColumnDef, Column } from '@tanstack/react-table';
import {
    Clock,
    PhoneIncoming,
    PhoneOutgoing,
    PlayCircle,
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

export const columns: ColumnDef<CallWithRecordings>[] = [
    {
        accessorKey: 'direction',
        header: ({ column }: { column: Column<CallWithRecordings, unknown> }) => (
            <DataTableColumnHeader column={column} title="Type" />
        ),
        cell: ({ row }) => {
            const direction = row.original.direction;
            const Icon = direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;

            return (
                <div className="flex w-full items-center gap-2 sm:w-[50%]">
                    <Icon
                        className={cn(
                            'h-4 w-4',
                            direction === 'inbound' ? 'text-green-500' : 'text-blue-500'
                        )}
                    />
                    <span className="capitalize">{direction}</span>
                </div>
            );
        }
    },
    {
        accessorKey: 'contact.name',
        header: ({ column }: { column: Column<CallWithRecordings, unknown> }) => (
            <DataTableColumnHeader column={column} title="Contact" />
        ),
        cell: ({ row }) => {
            const name = row.original.contact?.name || 'Unknown';
            return name !== 'Unknown' ? (
                <Link
                    href={`/dashboard/call?tab=contact&name=${row.original.toNumber}`}
                    className="text-foreground font-medium"
                >
                    {name}
                </Link>
            ) : (
                <span className="text-muted-foreground font-medium">{name}</span>
            );
        }
    },
    {
        accessorKey: 'fromNumber',
        header: 'From',
        cell: ({ cell }) => (
            <span className="text-muted-foreground font-mono text-sm">
                {cell.getValue<string>()}
            </span>
        )
    },
    {
        accessorKey: 'toNumber',
        header: 'To',
        cell: ({ cell }) => (
            <span className="text-muted-foreground font-mono text-sm">
                {cell.getValue<string>()}
            </span>
        )
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
                <div className="text-muted-foreground flex items-center gap-1 text-sm">
                    <Clock className="h-3.5 w-3.5" />
                    {minutes}:{remaining.toString().padStart(2, '0')} min
                </div>
            );
        }
    },
    {
        accessorKey: 'startedAt',
        header: ({ column }: { column: Column<CallWithRecordings, unknown> }) => (
            <DataTableColumnHeader column={column} title="Date" />
        ),
        cell: ({ cell }) => {
            const date = cell.getValue<string>();
            if (!date) return '—';
            const d = new Date(date);
            return (
                <div className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Calendar className="h-3.5 w-3.5" />
                    {d.toLocaleDateString()}{' '}
                    {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
            );
        }
    },
    {
        id: 'recordingStatus',
        header: 'Status',
        cell: ({ row }) => {
            const recordings = row.original.recordings || [];
            if (recordings.length === 0) {
                return (
                    <span className="text-muted-foreground text-xs">No recording</span>
                );
            }

            // Get the first recording's status
            const recording = recordings[0];
            const status = recording.status || 'started';
            const config = statusConfig[status] || statusConfig.started;
            const StatusIcon = config.icon;

            return (
                <Badge variant={config.variant} className="gap-1">
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
    },
    {
        id: 'recording',
        header: 'Recording',
        cell: ({ row }) => {
            const recordings = row.original.recordings || [];
            if (recordings.length === 0) {
                return <span className="text-muted-foreground text-xs">—</span>;
            }

            const recording = recordings[0];
            const recordingUrl = recording.url;
            const status = recording.status || 'started';

            // Only show play button if status is completed and URL exists
            if (status !== 'completed' || !recordingUrl) {
                return (
                    <span className="text-muted-foreground text-xs">
                        {status === 'started' || status === 'processing'
                            ? 'Processing...'
                            : 'Unavailable'}
                    </span>
                );
            }

            return (
                <div className="flex items-center gap-2">
                    <RecordingPlayButton
                        recordingUrl={recordingUrl}
                        callFrom={row.original.fromNumber}
                        callTo={row.original.toNumber}
                    />

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" asChild>
                                <a href={recordingUrl} download>
                                    <Download className="h-4 w-4" />
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
