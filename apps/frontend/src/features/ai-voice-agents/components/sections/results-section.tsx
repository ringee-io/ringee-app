'use client';

import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import type { AgentDraft } from '../../hooks/use-agent-draft';
import type { ExtractionFieldType } from '../../types';
import { controlClass, selectTriggerClass } from '../fields/field';
import { Section } from './section';

const FIELD_TYPES: ExtractionFieldType[] = [
  'text',
  'number',
  'boolean',
  'select'
];

/** A key from a label: "Team size" → "team_size". */
function toKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
      <div>
        <p className='text-sm font-medium'>{label}</p>
        <p className='text-muted-foreground text-xs'>{hint}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

/** What Ringee keeps from each conversation once it ends. */
export function ResultsSection({ draft }: { draft: AgentDraft }) {
  const t = useTranslations('aiVoiceAgents.results');
  return (
    <div className='space-y-8'>
      <Section title={t('afterCall')} hint={t('afterCallHint')}>
        <div className='grid gap-3 sm:grid-cols-3'>
          <Toggle
            label={t('outcome')}
            hint={t('outcomeHint')}
            checked
            disabled
          />
          <Toggle
            label={t('summary')}
            hint={t('summaryHint')}
            checked={draft.summary}
            onChange={draft.setSummary}
          />
          <Toggle
            label={t('sentiment')}
            hint={t('sentimentHint')}
            checked={draft.sentiment}
            onChange={draft.setSentiment}
          />
        </div>
      </Section>

      <Section
        title={t('extract')}
        hint={t('extractHint')}
        action={
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='rounded-lg'
            onClick={() =>
              draft.setFields((prev) => [
                ...prev,
                { key: '', label: '', type: 'text', description: '' }
              ])
            }
          >
            <Plus className='size-3.5' />
            {t('addField')}
          </Button>
        }
      >
        {draft.fields.length === 0 ? (
          <p className='text-muted-foreground rounded-lg border border-dashed py-8 text-center text-sm'>
            {t('empty')}
          </p>
        ) : (
          <div className='space-y-3'>
            {draft.fields.map((field, index) => {
              const labelError =
                draft.errors[`extractionFields.${index}.label`] ??
                draft.errors[`extractionFields.${index}.key`];
              return (
                <div
                  key={index}
                  className='grid items-start gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1.4fr_150px_auto]'
                >
                  <div className='space-y-2'>
                    <Label className='text-xs'>{t('field')}</Label>
                    <Input
                      value={field.label}
                      placeholder={t('fieldPlaceholder')}
                      aria-invalid={Boolean(labelError)}
                      className={controlClass}
                      onChange={(e) =>
                        draft.setFields((prev) =>
                          prev.map((f, i) =>
                            i === index
                              ? {
                                  ...f,
                                  label: e.target.value,
                                  key: toKey(e.target.value)
                                }
                              : f
                          )
                        )
                      }
                    />
                    {labelError ? (
                      <p role='alert' className='text-destructive text-xs'>
                        {labelError}
                      </p>
                    ) : null}
                  </div>

                  <div className='space-y-2'>
                    <Label className='text-xs'>{t('listenFor')}</Label>
                    <Input
                      value={field.description}
                      placeholder={t('listenForPlaceholder')}
                      className={controlClass}
                      onChange={(e) =>
                        draft.setFields((prev) =>
                          prev.map((f, i) =>
                            i === index
                              ? { ...f, description: e.target.value }
                              : f
                          )
                        )
                      }
                    />
                  </div>

                  <div className='space-y-2'>
                    <Label className='text-xs'>{t('type')}</Label>
                    <Select
                      value={field.type}
                      onValueChange={(value) =>
                        draft.setFields((prev) =>
                          prev.map((f, i) =>
                            i === index
                              ? { ...f, type: value as ExtractionFieldType }
                              : f
                          )
                        )
                      }
                    >
                      <SelectTrigger className={selectTriggerClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map((option) => (
                          <SelectItem key={option} value={option}>
                            {t(`types.${option}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className='space-y-2'>
                    {/* Matches the `text-xs` label line above the other three
                        controls, so the button lines up with the inputs. */}
                    <span aria-hidden className='block h-4' />
                    <Button
                      type='button'
                      variant='ghost'
                      aria-label={t('removeField', {
                        name: field.label || t('fieldFallback')
                      })}
                      className='size-10 rounded-lg p-0'
                      onClick={() =>
                        draft.setFields((prev) =>
                          prev.filter((_, i) => i !== index)
                        )
                      }
                    >
                      <Trash2 className='size-4' />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
