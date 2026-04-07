'use client';

import { useRouter } from 'next/navigation';
import { useDialerSessionStore, type AgentSessionStatus } from '../store/dialer-session.store';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Pause, Play, Square, ArrowLeft } from 'lucide-react';

const STATUS_LABELS: Record<AgentSessionStatus, string> = {
  ready: 'Ready',
  reserved: 'Assigning Lead...',
  dialing: 'Dialing',
  in_call: 'In Call',
  wrap_up: 'Wrap Up',
  paused: 'Paused',
  offline: 'Offline',
};

const STATUS_COLORS: Record<AgentSessionStatus, string> = {
  ready: 'bg-green-500',
  reserved: 'bg-yellow-500',
  dialing: 'bg-orange-500',
  in_call: 'bg-red-500',
  wrap_up: 'bg-purple-500',
  paused: 'bg-gray-400',
  offline: 'bg-gray-300',
};

function formatTalkTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface Props {
  campaignId: string;
  status: AgentSessionStatus;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
}

export function DialerStatusBar({ campaignId, status, onPause, onResume, onEnd }: Props) {
  const router = useRouter();
  const stats = useDialerSessionStore((s) => s.stats);
  const contactRate =
    stats.callsAttempted > 0
      ? Math.round((stats.callsConnected / stats.callsAttempted) * 100)
      : 0;

  return (
    <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/dashboard/campaigns/${campaignId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[status]}`} />
          <span className="text-sm font-medium">{STATUS_LABELS[status]}</span>
        </div>

        <div className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
          <span>Calls: {stats.callsAttempted}</span>
          <span>Connected: {stats.callsConnected}</span>
          <span>Rate: {contactRate}%</span>
          <span>Talk: {formatTalkTime(stats.totalTalkSec)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {status === 'paused' ? (
          <Button variant="outline" size="sm" onClick={onResume}>
            <Play className="mr-1 h-3.5 w-3.5" />
            Resume
          </Button>
        ) : (
          status !== 'in_call' &&
          status !== 'dialing' && (
            <Button variant="outline" size="sm" onClick={onPause}>
              <Pause className="mr-1 h-3.5 w-3.5" />
              Pause
            </Button>
          )
        )}
        <Button
          variant="destructive"
          size="sm"
          onClick={onEnd}
          disabled={status === 'in_call' || status === 'dialing'}
        >
          <Square className="mr-1 h-3.5 w-3.5" />
          End Session
        </Button>
      </div>
    </div>
  );
}
