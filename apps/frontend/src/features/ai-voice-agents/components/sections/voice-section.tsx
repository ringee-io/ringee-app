'use client';

import { useEffect, useState } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { CloneVoiceDialog } from '../clone-voice-dialog';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import type { AgentDraft } from '../../hooks/use-agent-draft';
import { flagEmoji, languageName, voiceOrigin } from '../../lib/voice-format';
import { VoicePicker } from '../voice-picker';
import { Section } from './section';

/** Hear the voice, then take it. The voice's language is the agent's language. */
export function VoiceSection({ draft }: { draft: AgentDraft }) {
  const t = useTranslations('aiVoiceAgents.voice');
  const locale = useLocale();
  const voice = draft.selectedVoice;
  const [creating, setCreating] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [pollPaused, setPollPaused] = useState(false);
  const pending = draft.voices.some(
    (item) => item.custom?.status === 'pending'
  );
  const refresh = draft.refreshCustomVoices;

  useEffect(() => {
    if (!pending) {
      setPollPaused(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const until = Date.now() + 120_000;
    const poll = async () => {
      if (cancelled) return;
      try {
        await refresh();
        if (!cancelled) setRefreshError(false);
      } catch {
        if (!cancelled) setRefreshError(true);
      }
      if (cancelled) return;
      if (Date.now() < until) timer = setTimeout(() => void poll(), 5000);
      else setPollPaused(true);
    };
    timer = setTimeout(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pending, refresh]);

  return (
    <Section
      title={t('title')}
      hint={t('hint')}
      action={
        voice ? (
          <Badge variant='secondary' className='gap-1.5 rounded-lg py-1'>
            <span aria-hidden>{flagEmoji(voice.countryCode)}</span>
            {voice.displayName}
            <span className='text-muted-foreground'>
              · {languageName(voice.language, locale)}
            </span>
          </Badge>
        ) : null
      }
    >
      {draft.voiceError || refreshError || pollPaused ? (
        <div
          role='status'
          className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm'
        >
          <span>{t(pollPaused ? 'clone.stillProcessing' : 'loadError')}</span>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              if (draft.voiceError) void draft.retryVoices();
              else
                void refresh()
                  .then(() => setRefreshError(false))
                  .catch(() => setRefreshError(true));
            }}
          >
            {t('retry')}
          </Button>
        </div>
      ) : null}
      <VoicePicker
        voices={draft.voices}
        loading={draft.catalogueLoading}
        selectedId={draft.voiceId}
        onSelect={(picked) => draft.setVoiceId(picked.id)}
        onCreateCustom={() => setCreating(true)}
      />
      {creating ? (
        <CloneVoiceDialog
          defaultLanguage={voice?.language}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            draft.addCustomVoice(created);
            if (created.custom?.status === 'ready')
              draft.setVoiceId(created.id);
          }}
        />
      ) : null}
      {voice ? (
        <p className='text-muted-foreground text-sm'>
          {t('selected')}{' '}
          <span className='text-foreground'>{voice.displayName}</span> —{' '}
          {voiceOrigin(voice, t(`genders.${voice.gender}`))}
        </p>
      ) : (
        <p className='text-muted-foreground text-sm'>{t('none')}</p>
      )}
    </Section>
  );
}
