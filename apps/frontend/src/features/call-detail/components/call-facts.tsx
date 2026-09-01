'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  CalendarClock,
  CircleDollarSign,
  Contact as ContactIcon,
  ExternalLink,
  Megaphone,
  NotebookPen,
  PhoneForwarded,
  Route,
  ServerCog,
  User as UserIcon
} from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { useEnumLabels } from '../lib/labels';
import {
  formatDateTime,
  formatDuration,
  formatMoney,
  formatTime,
  humanize,
  memberLabel
} from '../lib/format';
import type { CallDetail } from '../types';
import { AgentCostPanel } from './agent-panels';
import { Empty, Fact, Panel } from './primitives';

/** The right-hand column: who, how, when, what it cost. */

export function ContactPanel({ call }: { call: CallDetail }) {
  const t = useTranslations('calls.detail');
  const contact = call.contact;

  return (
    <Panel
      title={t('contact.title')}
      icon={ContactIcon}
      action={
        contact ? (
          <Button
            asChild
            variant='ghost'
            size='sm'
            className='h-7 rounded-lg px-2 text-xs'
          >
            <Link href={`/dashboard/contact/${contact.id}`}>
              {t('open')}
              <ExternalLink className='size-3' />
            </Link>
          </Button>
        ) : null
      }
    >
      {contact ? (
        <div className='divide-y'>
          <Fact label={t('contact.name')}>
            {contact.fullName || contact.name || (
              <Empty>{t('contact.unnamed')}</Empty>
            )}
          </Fact>
          <Fact label={t('contact.phone')} mono>
            {contact.phoneNumber}
          </Fact>
          {contact.email ? (
            <Fact label={t('contact.email')}>{contact.email}</Fact>
          ) : null}
          {contact.company ? (
            <Fact label={t('contact.company')}>{contact.company}</Fact>
          ) : null}
          {contact.jobTitle ? (
            <Fact label={t('contact.role')}>{contact.jobTitle}</Fact>
          ) : null}
        </div>
      ) : (
        <p className='text-muted-foreground text-sm'>{t('contact.none')}</p>
      )}
    </Panel>
  );
}

/** How the call was routed: numbers, origin, caller ID, device. */
export function RoutingPanel({ call }: { call: CallDetail }) {
  const t = useTranslations('calls.detail');
  const labels = useEnumLabels();
  const member = memberLabel(call);

  return (
    <Panel title={t('routing.title')} icon={Route}>
      <div className='divide-y'>
        <Fact label={t('routing.direction')}>
          {call.direction ? humanize(call.direction) : <Empty />}
        </Fact>
        <Fact label={t('routing.from')} mono>
          {call.fromNumber}
        </Fact>
        <Fact label={t('routing.to')} mono>
          {call.toNumber}
        </Fact>
        <Fact label={t('routing.placedFrom')}>
          {labels.source(call.source)}
        </Fact>
        {call.callerId ? (
          <Fact label={t('routing.callerId')} mono>
            {call.callerId.phoneNumber}
          </Fact>
        ) : null}
        {call.sipDevice ? (
          <Fact label={t('routing.deskPhone')}>{call.sipDevice.label}</Fact>
        ) : null}
        {member ? (
          <Fact label={t('routing.member')}>
            <span className='inline-flex items-center gap-1.5'>
              <UserIcon className='text-muted-foreground size-3.5' />
              {member}
            </span>
          </Fact>
        ) : null}
      </div>
    </Panel>
  );
}

/**
 * The call's own clock.
 *
 * Rendered as a vertical timeline rather than four labelled timestamps because
 * the gaps are the diagnosis: a long created→dialing gap is a queue, a missing
 * `answered` is a call that rang out, and a `hangupCause` explains which.
 */
export function TimelinePanel({ call }: { call: CallDetail }) {
  const t = useTranslations('calls.detail');
  const steps: Array<{ label: string; at: string | null; note?: string }> = [
    { label: t('timeline.created'), at: call.createdAt },
    { label: t('timeline.dialing'), at: call.startedAt },
    { label: t('timeline.answered'), at: call.answeredAt },
    {
      label: t('timeline.ended'),
      at: call.endedAt,
      note: call.hangupCause ? humanize(call.hangupCause) : undefined
    }
  ];

  return (
    <Panel title={t('timeline.title')} icon={CalendarClock}>
      <ol className='space-y-0'>
        {steps.map((step, index) => {
          const reached = Boolean(step.at);
          const last = index === steps.length - 1;
          return (
            <li key={step.label} className='flex gap-3'>
              <div className='flex flex-col items-center'>
                <span
                  className={
                    reached
                      ? 'bg-primary mt-1.5 size-2 shrink-0 rounded-full'
                      : 'border-muted-foreground/40 mt-1.5 size-2 shrink-0 rounded-full border'
                  }
                />
                {!last ? <span className='bg-border my-1 w-px flex-1' /> : null}
              </div>
              <div className={last ? 'pb-0' : 'pb-4'}>
                <p className='text-sm font-medium'>{step.label}</p>
                <p className='text-muted-foreground text-xs'>
                  {step.at ? formatTime(step.at) : t('timeline.never')}
                </p>
                {step.note ? (
                  <p className='text-muted-foreground mt-0.5 text-xs'>
                    {step.note}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className='divide-y border-t pt-2'>
        <Fact label={t('timeline.started')}>
          {formatDateTime(call.startedAt)}
        </Fact>
        <Fact label={t('timeline.talkTime')}>
          {formatDuration(call.durationSeconds)}
        </Fact>
      </div>
    </Panel>
  );
}

/** Telephony and AI cost, side by side but never blended. */
export function CostPanel({ call }: { call: CallDetail }) {
  const t = useTranslations('calls.detail');
  const agentCall = call.aiVoiceAgentCall;

  return (
    <Panel title={t('cost.title')} icon={CircleDollarSign}>
      <div className='divide-y'>
        <Fact label={t('cost.telephony')}>{formatMoney(call.totalCost)}</Fact>
      </div>
      {agentCall ? <AgentCostPanel agentCall={agentCall} /> : null}
    </Panel>
  );
}

/** The campaign attempt this call belongs to, when it was dialed by one. */
export function CampaignPanel({ call }: { call: CallDetail }) {
  const t = useTranslations('calls.detail');
  const attempt = call.callAttempts[0];
  if (!attempt) return null;

  return (
    <Panel
      title={t('campaign.title')}
      icon={Megaphone}
      action={
        attempt.campaign ? (
          <Button
            asChild
            variant='ghost'
            size='sm'
            className='h-7 rounded-lg px-2 text-xs'
          >
            <Link href={`/dashboard/campaigns/${attempt.campaign.id}`}>
              {t('open')}
              <ExternalLink className='size-3' />
            </Link>
          </Button>
        ) : null
      }
    >
      <div className='divide-y'>
        <Fact label={t('campaign.campaign')}>
          {attempt.campaign?.name ?? <Empty>{t('campaign.removed')}</Empty>}
        </Fact>
        <Fact label={t('campaign.attempt')}>#{attempt.attemptNumber}</Fact>
        <Fact label={t('campaign.disposition')}>
          {attempt.disposition?.label ??
            (attempt.dispositionCode ? (
              humanize(attempt.dispositionCode)
            ) : (
              <Empty>{t('campaign.notDispositioned')}</Empty>
            ))}
        </Fact>
      </div>
      {attempt.dispositionNote ? (
        <p className='text-muted-foreground text-sm'>
          {attempt.dispositionNote}
        </p>
      ) : null}
    </Panel>
  );
}

/** Meetings and callbacks this call produced. */
export function FollowUpPanel({ call }: { call: CallDetail }) {
  const t = useTranslations('calls.detail');
  // The agent's own meeting has its own panel; this covers everything else.
  const meetings = call.meetings.filter(
    (meeting) => meeting.id !== call.aiVoiceAgentCall?.meeting?.id
  );
  if (meetings.length === 0 && call.callbacks.length === 0) return null;

  return (
    <Panel title={t('followUp.title')} icon={PhoneForwarded}>
      <div className='divide-y'>
        {meetings.map((meeting) => (
          <Fact key={meeting.id} label={meeting.title || t('followUp.meeting')}>
            {formatDateTime(meeting.scheduledAt)}
          </Fact>
        ))}
        {call.callbacks.map((callback) => (
          <Fact
            key={callback.id}
            label={`${t('followUp.callback')} · ${humanize(callback.status)}`}
          >
            {formatDateTime(callback.scheduledAt)}
          </Fact>
        ))}
      </div>
    </Panel>
  );
}

/**
 * Provider identifiers.
 *
 * Last on the page on purpose: nobody reads these until a call has to be traced
 * with the carrier, and then they are the only thing that matters.
 */
export function DiagnosticsPanel({ call }: { call: CallDetail }) {
  const t = useTranslations('calls.detail');

  return (
    <Panel title={t('diagnostics.title')} icon={ServerCog}>
      <div className='divide-y'>
        <Fact label={t('diagnostics.callId')} mono>
          {call.id}
        </Fact>
        <Fact label={t('diagnostics.providerCall')} mono>
          {call.providerCallId ?? <Empty />}
        </Fact>
        <Fact label={t('diagnostics.controlId')} mono>
          {call.callControlId ?? <Empty />}
        </Fact>
        <Fact label={t('diagnostics.session')} mono>
          {call.callSessionId ?? <Empty />}
        </Fact>
      </div>
      {call.errorMessage ? (
        <p className='text-destructive border-destructive/30 bg-destructive/5 rounded-lg border p-2 text-xs'>
          {call.errorMessage}
        </p>
      ) : null}
    </Panel>
  );
}

/** The workspace's own disposition of the call, when someone logged one. */
export function OutcomeNote({ call }: { call: CallDetail }) {
  const t = useTranslations('calls.detail');
  if (!call.outcomeNote) return null;
  return (
    <Panel title={t('note.title')} icon={NotebookPen}>
      <p className='text-sm leading-relaxed'>{call.outcomeNote}</p>
    </Panel>
  );
}
