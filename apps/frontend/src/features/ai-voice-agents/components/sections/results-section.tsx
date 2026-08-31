'use client';

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

const FIELD_TYPES: Array<{ value: ExtractionFieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes / no' },
  { value: 'select', label: 'One of a list' }
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
  return (
    <div className='space-y-8'>
      <Section title='After the call' hint='What Ringee works out on its own.'>
        <div className='grid gap-3 sm:grid-cols-3'>
          <Toggle
            label='Outcome'
            hint='Always on — callers branch on it.'
            checked
            disabled
          />
          <Toggle
            label='Summary'
            hint='A few lines on what was said.'
            checked={draft.summary}
            onChange={draft.setSummary}
          />
          <Toggle
            label='Sentiment'
            hint='How the person sounded.'
            checked={draft.sentiment}
            onChange={draft.setSentiment}
          />
        </div>
      </Section>

      <Section
        title='Extract'
        hint='Anything else worth pulling out of the conversation.'
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
            Add field
          </Button>
        }
      >
        {draft.fields.length === 0 ? (
          <p className='text-muted-foreground rounded-lg border border-dashed py-8 text-center text-sm'>
            Nothing extra. Add a field to capture it on every call.
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
                    <Label className='text-xs'>Field</Label>
                    <Input
                      value={field.label}
                      placeholder='Team size'
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
                    <Label className='text-xs'>What to listen for</Label>
                    <Input
                      value={field.description}
                      placeholder='How many people are on their sales team'
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
                    <Label className='text-xs'>Type</Label>
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
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
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
                      aria-label={`Remove ${field.label || 'field'}`}
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
