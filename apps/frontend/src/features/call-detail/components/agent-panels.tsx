'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Bot,
  CalendarCheck,
  ExternalLink,
  Frown,
  Meh,
  Smile,
  Sparkles,
  Table2,
  Variable
} from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { useEnumLabels } from '../lib/labels';
import {
  formatDateTime,
  formatMoney,
  humanize,
  outcomeTone,
  sentimentTone
} from '../lib/format';
import type { CallDetailAgentCall } from '../types';
import { Empty, Fact, Panel, ToneBadge } from './primitives';

/**
 * What the agent produced, as opposed to what the phone network did.
 *
 * These panels only render for a call an agent placed. They are the reason the
 * detail screen exists for an AI call: the transcript says what was said, and
 * this says what the workspace got out of it — the outcome it can branch on,
 * the fields it asked to be extracted, and what the conversation cost.
 */

const SENTIMENT_ICONS = {
  positive: Smile,
  negative: Frown,
  neutral: Meh
} as const;

/** The agent's own conclusion: summary, outcome and sentiment. */
export function AgentAnalysisPanel({
  agentCall
}: {
  agentCall: CallDetailAgentCall;
}) {
  const t = useTranslations('calls.detail');
  const labels = useEnumLabels();
  const { summary, outcome, sentiment } = agentCall;
  const SentimentIcon =
    SENTIMENT_ICONS[sentiment as keyof typeof SENTIMENT_ICONS] ?? Meh;

  // Analysis lands on a webhook after the call ends, so "nothing here yet" is a
  // normal state for a call that just finished — not a failure.
  const hasAnything = Boolean(summary || outcome || sentiment);

  return (
    <Panel
      title={t('ai.analysis')}
      icon={Sparkles}
      action={
        <div className='flex flex-wrap items-center gap-2'>
          {outcome ? (
            <ToneBadge tone={outcomeTone(outcome)}>
              {labels.agentOutcome(outcome)}
            </ToneBadge>
          ) : null}
          {sentiment ? (
            <ToneBadge tone={sentimentTone(sentiment)} icon={SentimentIcon}>
              {labels.sentiment(sentiment)}
            </ToneBadge>
          ) : null}
        </div>
      }
    >
      {summary ? (
        <p className='text-sm leading-relaxed'>{summary}</p>
      ) : (
        <p className='text-muted-foreground text-sm'>
          {hasAnything ? t('ai.noSummary') : t('ai.pending')}
        </p>
      )}

      {agentCall.lastError ? (
        <p className='text-destructive border-destructive/30 bg-destructive/5 rounded-lg border p-2 text-xs'>
          {agentCall.lastError}
        </p>
      ) : null}
    </Panel>
  );
}

/** The user-defined extraction fields, as a readable table. */
export function ExtractedDataPanel({
  data
}: {
  data: Record<string, unknown>;
}) {
  const t = useTranslations('calls.detail');
  const entries = Object.entries(data);
  if (entries.length === 0) return null;

  /**
   * A null here is meaningful and must not be hidden: the agent was told to
   * return null for anything the call did not actually establish, so "not
   * established" is the finding, not a gap in the data.
   */
  const renderValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') {
      return <Empty>{t('ai.notEstablished')}</Empty>;
    }
    if (typeof value === 'boolean') return value ? t('ai.yes') : t('ai.no');
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;
    return <code className='text-xs break-all'>{JSON.stringify(value)}</code>;
  };

  return (
    <Panel
      title={t('ai.extracted')}
      icon={Table2}
      description={t('ai.extractedHint')}
    >
      <dl className='divide-y'>
        {entries.map(([key, value]) => (
          <div
            key={key}
            className='flex items-baseline justify-between gap-4 py-2'
          >
            <dt className='text-muted-foreground shrink-0 text-xs'>
              {humanize(key)}
            </dt>
            <dd className='min-w-0 text-right text-sm font-medium break-words'>
              {renderValue(value)}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** Who the agent was, and what it was told before it dialed. */
export function AgentPanel({ agentCall }: { agentCall: CallDetailAgentCall }) {
  const t = useTranslations('calls.detail');
  const agent = agentCall.agent;
  const variables = Object.entries(agentCall.variables ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );

  return (
    <Panel
      title={t('ai.agent')}
      icon={Bot}
      action={
        agent ? (
          <Button
            asChild
            variant='ghost'
            size='sm'
            className='h-7 rounded-lg px-2 text-xs'
          >
            <Link href={`/dashboard/ai-voice-agents/${agent.id}`}>
              {t('open')}
              <ExternalLink className='size-3' />
            </Link>
          </Button>
        ) : null
      }
    >
      {agent ? (
        <div className='divide-y'>
          <Fact label={t('ai.agentName')}>{agent.name}</Fact>
          <Fact label={t('ai.agentType')}>{humanize(agent.type)}</Fact>
          <Fact label={t('ai.voice')}>
            {agent.voiceLabel ?? <Empty>{t('ai.providerDefault')}</Empty>}
          </Fact>
          {agent.companyName ? (
            <Fact label={t('ai.speakingFor')}>{agent.companyName}</Fact>
          ) : null}
        </div>
      ) : (
        // The agent row is soft-deleted, but its calls survive it.
        <p className='text-muted-foreground text-sm'>{t('ai.agentDeleted')}</p>
      )}

      {variables.length > 0 ? (
        <>
          <Separator />
          <div>
            <p className='text-muted-foreground mb-1 flex items-center gap-1.5 text-xs'>
              <Variable className='size-3.5' />
              {t('ai.variables')}
            </p>
            <div className='divide-y'>
              {variables.map(([key, value]) => (
                <Fact key={key} label={humanize(key)}>
                  {String(value)}
                </Fact>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </Panel>
  );
}

/** The meeting the booking tool actually created, if it did. */
export function AgentMeetingPanel({
  agentCall
}: {
  agentCall: CallDetailAgentCall;
}) {
  const t = useTranslations('calls.detail');
  const meeting = agentCall.meeting;
  if (!meeting) return null;

  return (
    <Panel title={t('ai.meetingBooked')} icon={CalendarCheck}>
      <div className='divide-y'>
        <Fact label={t('ai.meetingTitle')}>
          {meeting.title ?? <Empty>{t('ai.meetingFallback')}</Empty>}
        </Fact>
        <Fact label={t('ai.meetingWhen')}>
          {formatDateTime(meeting.scheduledAt)}
        </Fact>
        <Fact label={t('ai.meetingLength')}>
          {t('minutes', { count: meeting.duration })}
        </Fact>
        {meeting.location ? (
          <Fact label={t('ai.meetingWhere')}>
            <a
              href={meeting.location}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary underline underline-offset-2'
            >
              {t('ai.joinLink')}
            </a>
          </Fact>
        ) : null}
      </div>
    </Panel>
  );
}

/**
 * The AI half of the bill, kept separate from telephony.
 *
 * They are two different charges — the provider's model and speech cost, and
 * the minutes on the wire — and a workspace reconciling spend needs to see
 * which is which rather than one blended number.
 */
export function AgentCostPanel({
  agentCall
}: {
  agentCall: CallDetailAgentCall;
}) {
  const t = useTranslations('calls.detail');
  if (agentCall.aiCostUsd === null && agentCall.aiChargedCredits === null) {
    return null;
  }
  return (
    <div className='divide-y'>
      <Fact label={t('ai.providerCost')}>
        {formatMoney(agentCall.aiCostUsd)}
      </Fact>
      <Fact label={t('ai.charged')}>
        {agentCall.aiChargedCredits === null ? (
          <Empty />
        ) : (
          t('credits', { value: agentCall.aiChargedCredits.toFixed(2) })
        )}
      </Fact>
    </div>
  );
}
