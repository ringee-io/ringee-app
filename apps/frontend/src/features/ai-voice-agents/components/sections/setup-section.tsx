'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
import { CallerNumberSelect } from '../caller-number-select';
import { Field, controlClass, selectTriggerClass } from '../fields/field';
import { Section } from './section';

/** Who the agent is, which model runs it, and — for booking — where it books. */
export function SetupSection({
  draft,
  type
}: {
  draft: AgentDraft;
  type: VoiceAgentType;
}) {
  const t = useTranslations('aiVoiceAgents.setup');
  const tCommon = useTranslations('aiVoiceAgents.common');
  const booking = type === 'appointment_booking';

  return (
    <div className='space-y-8'>
      <Section title={t('identity')} hint={t('identityHint')}>
        <Field
          label={t('agentName')}
          htmlFor='agent-name'
          required
          error={draft.errors.name}
          hint={t('agentNameHint')}
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

      <Section title={t('number')} hint={t('numberHint')}>
        {draft.callerNumbers.length === 0 ? (
          <Alert className='rounded-lg'>
            <AlertTriangle className='size-4' />
            <AlertDescription className='flex flex-wrap items-center gap-2'>
              {t('noNumber')}
              <Button
                asChild
                variant='outline'
                size='sm'
                className='rounded-lg'
              >
                <Link href='/dashboard/buy-number'>{t('getNumber')}</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <Field
            label={t('callerNumber')}
            htmlFor='agent-number'
            error={draft.errors.callerNumberId}
            hint={t('callerNumberHint')}
            className='max-w-md'
          >
            <CallerNumberSelect
              id='agent-number'
              numbers={draft.callerNumbers}
              value={draft.callerNumberId}
              onChange={draft.setCallerNumberId}
              placeholder={t('chooseNumber')}
              unsetLabel={t('askEachCall')}
              invalid={Boolean(draft.errors.callerNumberId)}
            />
          </Field>
        )}
      </Section>

      <Section title={t('model')} hint={t('modelHint')}>
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
                      {t('recommended')}
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
                  {model.hosting === 'ringee' ? t('selfHosted') : t('ownKey')} ·{' '}
                  {model.summary}
                </p>
              </button>
            );
          })}
        </div>

        {draft.needsKey ? (
          <Field
            label={t('apiKey', {
              provider: draft.selectedModel?.displayName ?? t('provider')
            })}
            htmlFor='agent-key'
            required
            error={draft.errors.apiKey}
            hint={t('apiKeyHint')}
            className='max-w-xl'
          >
            <div className='flex gap-2'>
              <Input
                id='agent-key'
                type='password'
                value={draft.apiKey}
                onChange={(e) => draft.setApiKey(e.target.value)}
                placeholder={draft.keyAlreadySaved ? t('keySaved') : 'sk-…'}
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
                    {tCommon('verified')}
                  </>
                ) : (
                  tCommon('verify')
                )}
              </Button>
            </div>
          </Field>
        ) : null}
      </Section>

      {booking ? (
        <Section title={t('meetings')} hint={t('meetingsHint')}>
          {draft.calendars.length === 0 ? (
            <Alert className='rounded-lg'>
              <AlertTriangle className='size-4' />
              <AlertDescription className='flex flex-wrap items-center gap-2'>
                {t('noCalendar')}
                <Button
                  asChild
                  variant='outline'
                  size='sm'
                  className='rounded-lg'
                >
                  <Link href='/dashboard/meetings'>{t('connectCalendar')}</Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Field
              label={t('calendar')}
              required
              error={draft.errors.calendarIntegrationId}
              hint={t('calendarHint')}
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
                  <SelectValue placeholder={t('chooseCalendar')} />
                </SelectTrigger>
                <SelectContent>
                  {draft.calendars.map((calendar) => (
                    <SelectItem key={calendar.id} value={calendar.id}>
                      {t.has(`calendars.${calendar.provider}`)
                        ? t(`calendars.${calendar.provider}`)
                        : calendar.provider}
                      {calendar.email ? ` · ${calendar.email}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <div className='grid gap-4 sm:grid-cols-3'>
            <Field
              label={t('duration')}
              htmlFor='meeting-duration'
              error={draft.errors.meetingDurationMinutes}
              hint={t('durationHint')}
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
              label={t('timezone')}
              htmlFor='meeting-timezone'
              error={draft.errors.timezone}
              hint={t('timezoneHint')}
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
              label={t('meetingTitle')}
              htmlFor='meeting-title'
              error={draft.errors.meetingTitle}
              hint={t('meetingTitleHint')}
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
