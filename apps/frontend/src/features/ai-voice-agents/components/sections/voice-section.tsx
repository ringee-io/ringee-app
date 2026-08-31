'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import type { AgentDraft } from '../../hooks/use-agent-draft';
import { flagEmoji, languageName, voiceOrigin } from '../../lib/voice-format';
import { VoicePicker } from '../voice-picker';
import { Section } from './section';

/** Hear the voice, then take it. The voice's language is the agent's language. */
export function VoiceSection({ draft }: { draft: AgentDraft }) {
  const t = useTranslations('aiVoiceAgents.voice');
  const voice = draft.selectedVoice;

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
              · {languageName(voice.language)}
            </span>
          </Badge>
        ) : null
      }
    >
      <VoicePicker
        voices={draft.voices}
        loading={draft.catalogueLoading}
        selectedId={draft.voiceId}
        onSelect={(picked) => draft.setVoiceId(picked.id)}
      />
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
