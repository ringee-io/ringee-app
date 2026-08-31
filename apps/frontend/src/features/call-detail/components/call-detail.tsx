'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CircleDollarSign,
  Clock,
  PhoneIncoming,
  PhoneOutgoing,
  RotateCw,
  Target
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { FinalTranscript } from '@/features/transcription';
import { RecordingPlayButton } from '@/features/recordings/components/recordings.tables/recording-play-button';
import { useQuickDialerCall } from '@/features/calls/hooks/use.quick.dialer.call';
import { describeApiError } from '@/features/ai-voice-agents/lib/api-error';
import { useCallDetailApi } from '../api';
import { useEnumLabels } from '../lib/labels';
import {
  contactName,
  counterparty,
  formatDateTime,
  formatDuration,
  formatMoney,
  outcomeTone,
  playableRecording
} from '../lib/format';
import type { CallDetail as CallDetailData } from '../types';
import {
  AgentAnalysisPanel,
  AgentMeetingPanel,
  AgentPanel,
  ExtractedDataPanel
} from './agent-panels';
import {
  CampaignPanel,
  ContactPanel,
  CostPanel,
  DiagnosticsPanel,
  FollowUpPanel,
  OutcomeNote,
  RoutingPanel,
  TimelinePanel
} from './call-facts';
import { Stat, ToneBadge } from './primitives';

/**
 * One call, in full.
 *
 * The screen answers three questions in descending order of urgency: what came
 * of the call, what was actually said, and how it was routed. That order is why
 * the outcome strip sits above everything, the conversation owns the wide
 * column, and the identifiers a carrier ticket needs are last.
 *
 * An AI call adds panels rather than getting a different screen. Someone
 * reviewing the day's calls should not have to learn two layouts depending on
 * who dialed, and every fact that applies to both — cost, routing, recording —
 * stays in the same place either way.
 */
export function CallDetail({ callId }: { callId: string }) {
  const t = useTranslations('calls.detail');
  const tStatus = useTranslations('calls.statusValues');
  const labels = useEnumLabels();
  const api = useCallDetailApi();
  const { handleRecall } = useQuickDialerCall();
  const [call, setCall] = useState<CallDetailData>();
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      setCall(await api.get(callId));
    } catch (error) {
      setFailure(describeApiError(error, t('errorFallback')));
    } finally {
      setLoading(false);
    }
  }, [api, callId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState />;

  if (failure || !call) {
    return (
      <div className='w-full space-y-4'>
        <BackLink />
        <Alert variant='destructive' className='rounded-xl'>
          <AlertTriangle className='size-4' />
          <AlertTitle>{t('errorTitle')}</AlertTitle>
          <AlertDescription className='flex flex-wrap items-center gap-3'>
            {failure ?? t('errorFallback')}
            <Button
              variant='outline'
              size='sm'
              className='rounded-lg'
              onClick={() => void load()}
            >
              <RotateCw className='size-3.5' />
              {t('retry')}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const agentCall = call.aiVoiceAgentCall;
  const inbound = call.direction === 'inbound';
  const DirectionIcon = inbound ? PhoneIncoming : PhoneOutgoing;
  const recording = playableRecording(call);
  const extracted = agentCall?.extractedData ?? null;

  // An AI call has two outcomes — the agent's conclusion and whatever a human
  // later logged. The agent's is the one that describes this conversation.
  const headlineOutcome =
    labels.agentOutcome(agentCall?.outcome) ??
    labels.outcome(call.outcome) ??
    t('notSet');

  return (
    <div className='w-full space-y-5'>
      <BackLink />

      <header className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h1 className='truncate text-xl font-semibold tracking-tight'>
              {contactName(call) ?? counterparty(call)}
            </h1>
            <ToneBadge
              tone={call.status === 'failed' ? 'bad' : 'neutral'}
              icon={DirectionIcon}
            >
              {tStatus.has(call.status) ? tStatus(call.status) : call.status}
            </ToneBadge>
            {agentCall ? (
              <ToneBadge tone='neutral' icon={Bot}>
                {agentCall.agent?.name ?? t('aiAgent')}
              </ToneBadge>
            ) : null}
          </div>
          <p className='text-muted-foreground mt-1 font-mono text-sm'>
            {counterparty(call)}
          </p>
        </div>

        <div className='flex shrink-0 flex-wrap items-center gap-2'>
          {recording?.url ? (
            <RecordingPlayButton
              recordingUrl={recording.url}
              callFrom={call.fromNumber}
              callTo={call.toNumber}
            />
          ) : null}
          <Button
            variant='outline'
            size='sm'
            className='rounded-lg'
            onClick={() => handleRecall(counterparty(call))}
          >
            <PhoneOutgoing className='size-3.5' />
            {t('callAgain')}
          </Button>
        </div>
      </header>

      <div className='flex flex-col gap-3 sm:flex-row'>
        <Stat
          label={t('stats.outcome')}
          value={headlineOutcome}
          icon={Target}
          tone={outcomeTone(agentCall?.outcome ?? call.outcome)}
        />
        <Stat
          label={t('stats.talkTime')}
          value={formatDuration(call.durationSeconds)}
          icon={Clock}
        />
        <Stat
          label={t('stats.cost')}
          value={formatMoney(call.totalCost)}
          icon={CircleDollarSign}
        />
        <Stat
          label={labels.source(call.source)}
          value={formatDateTime(call.startedAt ?? call.createdAt)}
          icon={DirectionIcon}
        />
      </div>

      <div className='grid gap-4 lg:grid-cols-3'>
        <div className='space-y-4 lg:col-span-2'>
          {agentCall ? <AgentAnalysisPanel agentCall={agentCall} /> : null}
          {extracted ? <ExtractedDataPanel data={extracted} /> : null}
          <OutcomeNote call={call} />
          <FinalTranscript callId={call.id} className='rounded-xl' />
        </div>

        <div className='space-y-4'>
          <ContactPanel call={call} />
          {agentCall ? <AgentPanel agentCall={agentCall} /> : null}
          {agentCall ? <AgentMeetingPanel agentCall={agentCall} /> : null}
          <CampaignPanel call={call} />
          <FollowUpPanel call={call} />
          <RoutingPanel call={call} />
          <TimelinePanel call={call} />
          <CostPanel call={call} />
          <DiagnosticsPanel call={call} />
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  const t = useTranslations('calls.detail');
  return (
    <Button
      asChild
      variant='ghost'
      size='sm'
      className='-ml-2 h-8 rounded-lg px-2'
    >
      <Link href='/dashboard/history'>
        <ArrowLeft className='size-4' />
        {t('back')}
      </Link>
    </Button>
  );
}

function LoadingState() {
  return (
    <div className='w-full space-y-5'>
      <Skeleton className='h-8 w-32 rounded-lg' />
      <Skeleton className='h-12 w-72 rounded-lg' />
      <div className='flex flex-col gap-3 sm:flex-row'>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className='h-16 flex-1 rounded-xl' />
        ))}
      </div>
      <div className='grid gap-4 lg:grid-cols-3'>
        <div className='space-y-4 lg:col-span-2'>
          <Skeleton className='h-40 w-full rounded-xl' />
          <Skeleton className='h-64 w-full rounded-xl' />
        </div>
        <div className='space-y-4'>
          <Skeleton className='h-44 w-full rounded-xl' />
          <Skeleton className='h-56 w-full rounded-xl' />
        </div>
      </div>
    </div>
  );
}
