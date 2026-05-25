'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Clock,
  Layers,
  PhoneCall,
  ShieldCheck,
  Wallet,
  Zap,
} from 'lucide-react';
import type { CallSessionPhase, DialerMode } from '../use-call-session';

const PHASE_LABELS: Record<CallSessionPhase, string> = {
  loading: 'Loading…',
  error: 'Error',
  preview: 'Ready',
  dialing: 'Dialing',
  in_call: 'In Call',
  wrap_up: 'Wrap Up',
  completed: 'Completed',
};

const PHASE_COLORS: Record<CallSessionPhase, string> = {
  loading: 'bg-gray-300',
  error: 'bg-red-500',
  preview: 'bg-green-500',
  dialing: 'bg-orange-500',
  in_call: 'bg-red-500',
  wrap_up: 'bg-purple-500',
  completed: 'bg-gray-400',
};

interface Props {
  title: string;
  phase: CallSessionPhase;
  creditsOk: boolean;
  creditBalance: number;
  expiresAt: string | null;
  telnyxStatus: 'idle' | 'connecting' | 'registered' | 'reconnecting' | 'disconnected' | 'error';
  mode: DialerMode;
  onModeChange: (mode: DialerMode) => void;
  stats: {
    total: number;
    completed: number;
    remaining: number;
    contactRate: number;
  };
}

function formatExpiry(ms: number | null): string | null {
  if (ms == null) return null;
  if (ms <= 0) return 'expired';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatCredits(balance: number): string {
  return `$${balance.toFixed(2)}`;
}

export function SessionStatusBar({
  title,
  phase,
  creditsOk,
  creditBalance,
  expiresAt,
  telnyxStatus,
  mode,
  onModeChange,
  stats,
}: Props) {
  const expiresInMs = useExpiry(expiresAt);

  const lineDot =
    telnyxStatus === 'registered'
      ? 'bg-green-500'
      : telnyxStatus === 'connecting' || telnyxStatus === 'reconnecting'
        ? 'bg-amber-500 animate-pulse'
        : 'bg-red-500';

  const canChangeMode = phase === 'preview' || phase === 'completed';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="bg-primary flex h-7 w-7 items-center justify-center rounded-md text-sm font-semibold text-primary-foreground">
            R
          </div>
          <div className="hidden text-sm font-semibold sm:inline">{title}</div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${PHASE_COLORS[phase]}`} />
          <span className="text-sm font-medium">{PHASE_LABELS[phase]}</span>
        </div>

        <div className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
          <span className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" />
            {stats.completed} / {stats.total}
          </span>
          <span className="flex items-center gap-1">
            <PhoneCall className="h-3.5 w-3.5" />
            {stats.remaining} pending
          </span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            {stats.contactRate}% positive
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Dialer-mode segmented toggle */}
        <div className="hidden items-center rounded-md border bg-background p-0.5 text-xs sm:flex">
          <Button
            type="button"
            size="sm"
            variant={mode === 'preview' ? 'default' : 'ghost'}
            className="h-7 rounded-sm px-2.5"
            disabled={!canChangeMode}
            onClick={() => onModeChange('preview')}
            title="Show contact, then click Dial"
          >
            Preview
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'progressive' ? 'default' : 'ghost'}
            className="h-7 gap-1 rounded-sm px-2.5"
            disabled={!canChangeMode}
            onClick={() => onModeChange('progressive')}
            title="Auto-dial the next contact after each outcome"
          >
            <Zap className="h-3 w-3" />
            Progressive
          </Button>
        </div>

        {/* Line status */}
        <Badge variant="outline" className="gap-1">
          <span className={`h-2 w-2 rounded-full ${lineDot}`} />
          Line {telnyxStatus}
        </Badge>

        {/* Credit balance */}
        <Badge
          variant={creditsOk ? 'secondary' : 'destructive'}
          className="gap-1"
        >
          <Wallet className="h-3 w-3" />
          {formatCredits(creditBalance)}
        </Badge>

        {/* Expiration */}
        {expiresInMs != null && (
          <Badge
            variant={expiresInMs < 5 * 60 * 1000 ? 'destructive' : 'secondary'}
            className="gap-1"
          >
            <Clock className="h-3 w-3" />
            {expiresInMs <= 0
              ? 'Expired'
              : `Expires in ${formatExpiry(expiresInMs)}`}
          </Badge>
        )}
      </div>
    </div>
  );
}

function useExpiry(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return new Date(expiresAt).getTime() - now;
}
