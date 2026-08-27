'use client';

import { useRouter } from 'next/navigation';
import {
  useDialerSessionStore,
  type AgentSessionStatus
} from '../store/dialer-session.store';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Pause, Play, Square, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

const STATUS_COLORS: Record<AgentSessionStatus, string> = {
  ready: 'bg-green-500',
  reserved: 'bg-yellow-500',
  dialing: 'bg-orange-500',
  in_call: 'bg-red-500',
  wrap_up: 'bg-purple-500',
  paused: 'bg-gray-400',
  offline: 'bg-gray-300'
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

export function DialerStatusBar({
  campaignId,
  status,
  onPause,
  onResume,
  onEnd
}: Props) {
  const router = useRouter();
  const t = useTranslations('dialer.statusBar');
  const stats = useDialerSessionStore((s) => s.stats);
  const dialerMode = useDialerSessionStore((s) => s.dialerMode);
  const closeAfterLead = useDialerSessionStore((s) => s.closeAfterLead);
  const setCloseAfterLead = useDialerSessionStore((s) => s.setCloseAfterLead);
  const contactRate =
    stats.callsAttempted > 0
      ? Math.round((stats.callsConnected / stats.callsAttempted) * 100)
      : 0;

  return (
    <div className='bg-muted/30 flex flex-wrap items-center justify-between gap-y-2 border-b px-4 py-2'>
      <div className='flex items-center gap-4'>
        <Button
          variant='ghost'
          size='icon'
          onClick={() => router.push(`/dashboard/campaigns/${campaignId}`)}
        >
          <ArrowLeft className='h-4 w-4' />
        </Button>

        <div className='flex items-center gap-2'>
          <div
            className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[status]}`}
          />
          <span className='text-sm font-medium'>{t(`statuses.${status}`)}</span>
        </div>

        <div className='text-muted-foreground hidden items-center gap-4 text-sm sm:flex'>
          <span>{t('calls', { count: stats.callsAttempted })}</span>
          <span>{t('connected', { count: stats.callsConnected })}</span>
          <span>{t('rate', { rate: contactRate })}</span>
          <span>{t('talk', { time: formatTalkTime(stats.totalTalkSec) })}</span>
        </div>
      </div>

      <div className='flex items-center gap-2'>
        {/* Progressive only: in preview mode the agent already decides when the
            next lead is dialed, so "stop after this one" is just not dialing.
            Ending mid-call is refused below, which is exactly why this exists —
            it lets an agent leave cleanly without hanging up on someone. */}
        {dialerMode === 'progressive' && (
          <div className='mr-2 flex items-center gap-2'>
            <Checkbox
              id='close-after-lead'
              checked={closeAfterLead}
              onCheckedChange={(checked) => setCloseAfterLead(checked === true)}
            />
            <Label
              htmlFor='close-after-lead'
              className='text-muted-foreground cursor-pointer text-xs font-normal'
            >
              {t('closeAfterLead')}
            </Label>
          </div>
        )}

        {status === 'paused' ? (
          <Button variant='outline' size='sm' onClick={onResume}>
            <Play className='mr-1 h-3.5 w-3.5' />
            {t('resume')}
          </Button>
        ) : (
          status !== 'in_call' &&
          status !== 'dialing' && (
            <Button variant='outline' size='sm' onClick={onPause}>
              <Pause className='mr-1 h-3.5 w-3.5' />
              {t('pause')}
            </Button>
          )
        )}
        <Button
          variant='destructive'
          size='sm'
          onClick={onEnd}
          disabled={status === 'in_call' || status === 'dialing'}
        >
          <Square className='mr-1 h-3.5 w-3.5' />
          {t('endSession')}
        </Button>
      </div>
    </div>
  );
}
