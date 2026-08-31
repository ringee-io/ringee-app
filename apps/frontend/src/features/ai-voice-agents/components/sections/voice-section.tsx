'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import type { AgentDraft } from '../../hooks/use-agent-draft';
import { flagEmoji, languageName, voiceOrigin } from '../../lib/voice-format';
import { VoicePicker } from '../voice-picker';
import { Section } from './section';

/** Hear the voice, then take it. The voice's language is the agent's language. */
export function VoiceSection({ draft }: { draft: AgentDraft }) {
  const voice = draft.selectedVoice;

  return (
    <Section
      title='Voice'
      hint='Press play to hear a voice. The agent speaks its language.'
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
          Selected: <span className='text-foreground'>{voice.displayName}</span>{' '}
          — {voiceOrigin(voice)}
        </p>
      ) : (
        <p className='text-muted-foreground text-sm'>
          No voice chosen yet. An agent needs one before it can be activated.
        </p>
      )}
    </Section>
  );
}
