'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Building2,
  Check,
  ClipboardList,
  Loader2,
  Settings2
} from 'lucide-react';
import {
  Alert,
  AlertDescription
} from '@ringee/frontend-shared/components/ui/alert';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { FIELD_STEPS, useAgentDraft } from '../hooks/use-agent-draft';
import type { VoiceAgentType, VoiceAgentTypeInfo } from '../types';
import { AgentScreenContent } from './agent-screen';
import { CompanySection } from './sections/company-section';
import { ResultsSection } from './sections/results-section';
import { SetupSection } from './sections/setup-section';
import { VoiceSection } from './sections/voice-section';

const STEPS = [
  { id: 'setup', icon: Settings2 },
  { id: 'voice', icon: AudioLines },
  { id: 'company', icon: Building2 },
  { id: 'results', icon: ClipboardList }
] as const;

type StepId = (typeof STEPS)[number]['id'];

/**
 * Creating an agent, one decision at a time.
 *
 * Every step is reachable at any point — the numbers are a sense of progress,
 * not a gate — and the agent lands on its own Test tab, so the first thing a
 * user does after creating one is talk to it.
 *
 * A failed create jumps to the step holding the field that caused it. Sending a
 * user back to a four-step form with one line of red at the bottom is how a
 * form gets abandoned; landing them on the input is how it gets finished.
 */
export function AgentWizard({
  type,
  typeInfo,
  onDirtyChange
}: {
  type: VoiceAgentType;
  typeInfo?: VoiceAgentTypeInfo;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useTranslations('aiVoiceAgents.wizard');
  const tCommon = useTranslations('aiVoiceAgents.common');
  const router = useRouter();
  const draft = useAgentDraft(type);
  const [step, setStep] = useState<StepId>('setup');

  useEffect(() => {
    onDirtyChange(draft.dirty);
  }, [draft.dirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange(false);
    },
    [onDirtyChange]
  );

  const index = STEPS.findIndex((s) => s.id === step);
  const isLast = index === STEPS.length - 1;

  /** A step is "done" once it holds a real choice, not just a visit. */
  const done = useMemo<Record<StepId, boolean>>(
    () => ({
      setup: Boolean(draft.name.trim()),
      voice: Boolean(draft.voiceId),
      company: Boolean(draft.company.companyName?.trim()),
      results: true
    }),
    [draft.name, draft.voiceId, draft.company.companyName]
  );

  /** Which steps are currently holding something the user has to fix. */
  const stepsWithErrors = useMemo(() => {
    const flagged = new Set<StepId>();
    for (const path of Object.keys(draft.errors)) {
      if (path.startsWith('extractionFields')) flagged.add('results');
      const owner = FIELD_STEPS[path];
      if (owner && owner !== 'conversation') flagged.add(owner);
    }
    return flagged;
  }, [draft.errors]);

  const leave = () => router.push('/dashboard/ai-voice-agents');

  const create = async () => {
    const { saved, errors } = await draft.save();
    if (!saved) {
      // Open the step that owns the first field the save refused.
      const firstBad = Object.keys(errors)[0];
      const owner = firstBad?.startsWith('extractionFields')
        ? ('results' as const)
        : firstBad
          ? FIELD_STEPS[firstBad]
          : undefined;
      if (owner && owner !== 'conversation') setStep(owner);
      return;
    }
    router.push(`/dashboard/ai-voice-agents/${saved.id}?tab=test`);
    router.refresh();
  };

  return (
    <AgentScreenContent
      title={t('title')}
      subtitle={typeInfo?.title ?? t('defaultSubtitle')}
      footer={
        <>
          <div className='text-muted-foreground min-w-0 flex-1 text-sm'>
            {draft.blockers.length > 0 ? (
              <span className='truncate'>
                {t('stillNeeded', { items: draft.blockers.join(', ') })}
              </span>
            ) : (
              <span className='text-foreground'>{t('ready')}</span>
            )}
          </div>

          <Button
            variant='outline'
            className='rounded-lg'
            onClick={() =>
              index === 0 ? leave() : setStep(STEPS[index - 1]!.id)
            }
          >
            <ArrowLeft className='size-4' />
            {index === 0 ? tCommon('cancel') : tCommon('back')}
          </Button>

          {isLast ? (
            <Button
              className='rounded-lg'
              onClick={() => void create()}
              disabled={draft.saving}
            >
              {draft.saving ? (
                <Loader2 className='size-4 animate-spin' />
              ) : null}
              {t('createAgent')}
            </Button>
          ) : (
            <Button
              className='rounded-lg'
              onClick={() => setStep(STEPS[index + 1]!.id)}
            >
              {tCommon('next')}
              <ArrowRight className='size-4' />
            </Button>
          )}
        </>
      }
    >
      <div className='space-y-6'>
        <ol className='flex flex-wrap gap-2'>
          {STEPS.map((s, i) => {
            const active = s.id === step;
            const invalid = stepsWithErrors.has(s.id);
            const complete = done[s.id] && !active && !invalid;
            const Icon = s.icon;
            return (
              <li key={s.id}>
                <button
                  type='button'
                  onClick={() => setStep(s.id)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'focus-visible:ring-ring flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : invalid
                        ? 'border-destructive/50 text-destructive'
                        : complete
                          ? 'border-primary/30 text-foreground'
                          : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {invalid && !active ? (
                    <AlertTriangle className='size-3.5' />
                  ) : complete ? (
                    <Check className='text-primary size-3.5' />
                  ) : (
                    <Icon className='size-3.5' />
                  )}
                  <span className='hidden sm:inline'>{t(`steps.${s.id}`)}</span>
                  <span className='sm:hidden'>{i + 1}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {draft.saveError ? (
          <Alert variant='destructive' className='rounded-lg'>
            <AlertTriangle className='size-4' />
            <AlertDescription>{draft.saveError}</AlertDescription>
          </Alert>
        ) : null}

        {step === 'setup' ? (
          <SetupSection draft={draft} type={type} />
        ) : step === 'voice' ? (
          <VoiceSection draft={draft} />
        ) : step === 'company' ? (
          <CompanySection draft={draft} />
        ) : (
          <ResultsSection draft={draft} />
        )}
      </div>
    </AgentScreenContent>
  );
}
