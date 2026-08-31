'use client';

import Link from 'next/link';
import { AlertTriangle, Check, Loader2, Server, Sparkles } from 'lucide-react';
import {
  Alert,
  AlertDescription
} from '@ringee/frontend-shared/components/ui/alert';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { AgentDraft } from '../../hooks/use-agent-draft';
import type { VoiceAgentType } from '../../types';
import { Field, controlClass, selectTriggerClass } from '../fields/field';
import { Section } from './section';

const CALENDAR_LABELS: Record<string, string> = {
  google: 'Google Calendar',
  microsoft: 'Outlook Calendar'
};

/** Who the agent is, which model runs it, and — for booking — where it books. */
export function SetupSection({
  draft,
  type
}: {
  draft: AgentDraft;
  type: VoiceAgentType;
}) {
  const booking = type === 'appointment_booking';

  return (
    <div className='space-y-8'>
      <Section
        title='Identity'
        hint='The name the agent gives when someone picks up.'
      >
        <Field
          label='Agent name'
          htmlFor='agent-name'
          required
          error={draft.errors.name}
          hint='Something a person would say back — "Sofia", not "Booking bot v2".'
          className='max-w-md'
        >
          <Input
            id='agent-name'
            value={draft.name}
            onChange={(e) => draft.setName(e.target.value)}
            placeholder='Sofia'
            maxLength={60}
            aria-invalid={Boolean(draft.errors.name)}
            className={controlClass}
          />
        </Field>
      </Section>

      <Section
        title='Model'
        hint='What thinks during the conversation. Ringee AI needs no setup.'
      >
        <div className='grid gap-3 sm:grid-cols-2'>
          {draft.models.map((model) => {
            const active = draft.modelProvider === model.provider;
            return (
              <button
                key={model.provider}
                type='button'
                onClick={() => draft.chooseModel(model.provider)}
                aria-pressed={active}
                className={cn(
                  'focus-visible:ring-ring rounded-lg border p-4 text-left transition-all focus-visible:ring-2 focus-visible:outline-none',
                  active
                    ? 'border-primary ring-primary/20 bg-primary/5 ring-2'
                    : 'hover:border-primary/40 hover:bg-muted/40'
                )}
              >
                <div className='flex items-center gap-2'>
                  <span className='font-medium'>{model.displayName}</span>
                  {model.recommended ? (
                    <Badge variant='secondary' className='rounded-lg'>
                      <Sparkles className='size-3' />
                      Recommended
                    </Badge>
                  ) : null}
                  {active ? (
                    <Check className='text-primary ml-auto size-4 shrink-0' />
                  ) : null}
                </div>

                {/* The version is the point: it is what tells someone whether
                    the model they read about is the one they are getting. */}
                <p className='text-muted-foreground mt-2 flex items-center gap-1.5 font-mono text-xs'>
                  <Server className='size-3 shrink-0' />
                  <span className='truncate'>{model.modelId}</span>
                </p>
                <p className='text-muted-foreground mt-1.5 text-xs'>
                  {model.hosting === 'ringee' ? 'Self-hosted' : 'Your API key'}{' '}
                  · {model.summary}
                </p>
              </button>
            );
          })}
        </div>

        {draft.needsKey ? (
          <Field
            label={`${draft.selectedModel?.displayName ?? 'Provider'} API key`}
            htmlFor='agent-key'
            required
            error={draft.errors.apiKey}
            hint='Held by the voice provider. Ringee never stores it.'
            className='max-w-xl'
          >
            <div className='flex gap-2'>
              <Input
                id='agent-key'
                type='password'
                value={draft.apiKey}
                onChange={(e) => draft.setApiKey(e.target.value)}
                placeholder={
                  draft.keyAlreadySaved
                    ? 'Saved — enter a new key to replace it'
                    : 'sk-…'
                }
                aria-invalid={Boolean(draft.errors.apiKey)}
                className={controlClass}
              />
              <Button
                type='button'
                variant={draft.keyVerified ? 'secondary' : 'outline'}
                onClick={() => void draft.verifyKey()}
                disabled={draft.verifying || !draft.apiKey}
                className='h-10 shrink-0 rounded-lg'
              >
                {draft.verifying ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : draft.keyVerified ? (
                  <>
                    <Check className='size-4' />
                    Verified
                  </>
                ) : (
                  'Verify'
                )}
              </Button>
            </div>
          </Field>
        ) : null}
      </Section>

      {booking ? (
        <Section title='Meetings' hint='Where and how the agent books.'>
          {draft.calendars.length === 0 ? (
            <Alert className='rounded-lg'>
              <AlertTriangle className='size-4' />
              <AlertDescription className='flex flex-wrap items-center gap-2'>
                No calendar connected — the agent can be saved, but it cannot be
                activated until it has one.
                <Button
                  asChild
                  variant='outline'
                  size='sm'
                  className='rounded-lg'
                >
                  <Link href='/dashboard/meetings'>Connect a calendar</Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Field
              label='Calendar'
              required
              error={draft.errors.calendarIntegrationId}
              hint='The agent reads free time from here and books into it.'
              className='max-w-md'
            >
              <Select
                value={draft.calendarId}
                onValueChange={draft.setCalendarId}
              >
                <SelectTrigger
                  className={selectTriggerClass}
                  aria-invalid={Boolean(draft.errors.calendarIntegrationId)}
                >
                  <SelectValue placeholder='Choose a calendar' />
                </SelectTrigger>
                <SelectContent>
                  {draft.calendars.map((calendar) => (
                    <SelectItem key={calendar.id} value={calendar.id}>
                      {CALENDAR_LABELS[calendar.provider] ?? calendar.provider}
                      {calendar.email ? ` · ${calendar.email}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <div className='grid gap-4 sm:grid-cols-3'>
            <Field
              label='Duration'
              htmlFor='meeting-duration'
              error={draft.errors.meetingDurationMinutes}
              hint='In minutes.'
            >
              <Input
                id='meeting-duration'
                type='number'
                min={5}
                max={240}
                value={draft.duration}
                onChange={(e) => draft.setDuration(Number(e.target.value))}
                aria-invalid={Boolean(draft.errors.meetingDurationMinutes)}
                className={controlClass}
              />
            </Field>

            <Field
              label='Time zone'
              htmlFor='meeting-timezone'
              error={draft.errors.timezone}
              hint='The times the agent offers.'
            >
              <Input
                id='meeting-timezone'
                value={draft.timezone}
                onChange={(e) => draft.setTimezone(e.target.value)}
                placeholder='America/New_York'
                aria-invalid={Boolean(draft.errors.timezone)}
                className={controlClass}
              />
            </Field>

            <Field
              label='Meeting title'
              htmlFor='meeting-title'
              error={draft.errors.meetingTitle}
              hint='What lands in the calendar.'
            >
              <Input
                id='meeting-title'
                value={draft.meetingTitle}
                onChange={(e) => draft.setMeetingTitle(e.target.value)}
                placeholder='Product demo'
                maxLength={120}
                aria-invalid={Boolean(draft.errors.meetingTitle)}
                className={controlClass}
              />
            </Field>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
