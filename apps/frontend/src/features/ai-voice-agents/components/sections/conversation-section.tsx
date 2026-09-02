'use client';

import { Info, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Alert,
  AlertDescription
} from '@ringee/frontend-shared/components/ui/alert';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import type { AgentDraft } from '../../hooks/use-agent-draft';
import type { VoiceAgentGreetingMode, VoiceAgentVariable } from '../../types';
import { MarkdownEditor } from '../markdown-editor';
import { PromptVariableMenu } from '../prompt-variable-menu';
import {
  Field,
  controlClass,
  selectTriggerClass,
  textAreaClass
} from '../fields/field';
import { Section } from './section';

const GREETING_MODES: VoiceAgentGreetingMode[] = [
  'assistant_speaks_first',
  'assistant_generates_greeting',
  'assistant_waits_for_user'
];

/** Prompt, opening turn and Telnyx's optional post-conversation LLM turn. */
export function ConversationSection({
  draft,
  variables
}: {
  draft: AgentDraft;
  variables: VoiceAgentVariable[];
}) {
  const t = useTranslations('aiVoiceAgents.conversation');
  const settings = draft.conversation;

  if (!settings) {
    return (
      <Alert variant='destructive' className='rounded-lg'>
        <Info className='size-4' />
        <AlertDescription>{t('unavailable')}</AlertDescription>
      </Alert>
    );
  }

  const update = <Key extends keyof typeof settings>(
    key: Key,
    value: (typeof settings)[Key]
  ) => draft.setConversation({ ...settings, [key]: value });

  const addGreetingVariable = (token: string) => {
    const separator =
      settings.greeting && !settings.greeting.endsWith(' ') ? ' ' : '';
    update('greeting', `${settings.greeting}${separator}${token}`);
  };

  return (
    <div className='space-y-10'>
      <Alert className='rounded-xl'>
        <Sparkles className='size-4' />
        <AlertDescription>{t('defaultsNotice')}</AlertDescription>
      </Alert>

      <Section title={t('openingTitle')} hint={t('openingHint')}>
        <Field
          label={t('greetingMode')}
          tooltip={t('greetingModeTooltip')}
          hint={t('greetingModeHint')}
          className='max-w-xl'
        >
          <Select
            value={settings.greetingMode}
            onValueChange={(value) =>
              update('greetingMode', value as VoiceAgentGreetingMode)
            }
          >
            <SelectTrigger className={selectTriggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GREETING_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`modes.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label={t('greeting')}
          htmlFor='agent-greeting'
          required={settings.greetingMode === 'assistant_speaks_first'}
          tooltip={t('greetingTooltip')}
          hint={
            settings.greetingMode === 'assistant_speaks_first'
              ? t('greetingHint')
              : t('greetingInactiveHint')
          }
          error={draft.errors['conversation.greeting']}
          action={
            <PromptVariableMenu
              variables={variables}
              onInsert={addGreetingVariable}
              label={t('addVariable')}
            />
          }
        >
          <Input
            id='agent-greeting'
            value={settings.greeting}
            onChange={(event) => update('greeting', event.target.value)}
            disabled={settings.greetingMode !== 'assistant_speaks_first'}
            maxLength={3000}
            aria-invalid={Boolean(draft.errors['conversation.greeting'])}
            className={controlClass}
          />
        </Field>
      </Section>

      <Section title={t('instructionsTitle')} hint={t('instructionsHint')}>
        <Field
          label={t('instructions')}
          required
          tooltip={t('instructionsTooltip')}
          error={draft.errors['conversation.instructions']}
        >
          <MarkdownEditor
            value={settings.instructions}
            onChange={(value) => update('instructions', value)}
            variables={variables}
            label={t('instructions')}
            placeholder={t('instructionsPlaceholder')}
            invalid={Boolean(draft.errors['conversation.instructions'])}
          />
        </Field>
      </Section>

      <Section title={t('postTitle')} hint={t('postHint')}>
        <Field
          label={t('postProcessing')}
          tooltip={t('postProcessingTooltip')}
          hint={t('postProcessingHint')}
        >
          <div className='bg-muted/30 flex min-h-12 items-center gap-3 rounded-xl border px-4 py-3'>
            <Switch
              checked={settings.postConversationEnabled}
              onCheckedChange={(checked) =>
                update('postConversationEnabled', checked)
              }
              aria-label={t('postProcessing')}
            />
            <span className='text-sm font-medium'>
              {settings.postConversationEnabled ? t('enabled') : t('disabled')}
            </span>
            <Badge variant='secondary' className='ml-auto rounded-lg'>
              {t('beta')}
            </Badge>
          </div>
        </Field>

        <Field
          label={t('postInstructions')}
          htmlFor='post-conversation-instructions'
          tooltip={t('postInstructionsTooltip')}
          hint={t('postInstructionsHint')}
          error={draft.errors['conversation.postConversationInstructions']}
        >
          <Textarea
            id='post-conversation-instructions'
            value={settings.postConversationInstructions}
            onChange={(event) =>
              update('postConversationInstructions', event.target.value)
            }
            disabled={!settings.postConversationEnabled}
            maxLength={20000}
            placeholder={t('postInstructionsPlaceholder')}
            aria-invalid={Boolean(
              draft.errors['conversation.postConversationInstructions']
            )}
            className={`${textAreaClass} min-h-32 resize-y`}
          />
        </Field>
      </Section>
    </div>
  );
}
