'use client';

import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel
} from '@ringee/frontend-shared/components/ui/form';
import { FormInput } from '@ringee/frontend-shared/components/forms/form-input';
import { FormSelect } from '@ringee/frontend-shared/components/forms/form-select';
import { FormSwitch } from '@ringee/frontend-shared/components/forms/form-switch';
import { FormTextarea } from '@ringee/frontend-shared/components/forms/form-textarea';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useEnumLabels } from '@/features/call-detail/lib/labels';
import type { DispositionInput, WorkspaceDisposition } from '../types';

/** A palette that reads on both themes; any other hex is one click away. */
const SWATCHES = [
  '#10B981',
  '#16A34A',
  '#3B82F6',
  '#6366F1',
  '#A855F7',
  '#F59E0B',
  '#F97316',
  '#EF4444',
  '#64748B',
  '#6B7280'
];

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing this one; creating when absent. */
  disposition?: WorkspaceDisposition | null;
  /** The canonical outcomes the API says a disposition can map to. */
  outcomes: string[];
  onSubmit: (input: DispositionInput) => Promise<void>;
}

export function DispositionFormDialog({
  open,
  onOpenChange,
  disposition,
  outcomes,
  onSubmit
}: Props) {
  const t = useTranslations('settings.dispositions.form');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {disposition ? t('editTitle') : t('createTitle')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {/* Keyed so each open starts from the row it edits, not the last one. */}
        <DispositionForm
          key={disposition?.id ?? 'new'}
          disposition={disposition ?? null}
          outcomes={outcomes}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function DispositionForm({
  disposition,
  outcomes,
  onSubmit,
  onCancel
}: {
  disposition: WorkspaceDisposition | null;
  outcomes: string[];
  onSubmit: (input: DispositionInput) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('settings.dispositions.form');
  const labels = useEnumLabels();
  // What a recorded disposition means is fixed: the server refuses a change.
  const outcomeLocked = Boolean(disposition?.inUse);

  const schema = z.object({
    name: z.string().trim().min(1, t('required')).max(60, t('tooLong')),
    canonicalOutcome: z.string().min(1, t('required')),
    color: z.string().regex(HEX_COLOR).nullable(),
    description: z.string().trim().max(300, t('tooLong')),
    isDefault: z.boolean()
  });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: disposition?.label ?? '',
      canonicalOutcome: disposition?.canonicalOutcome ?? '',
      color: disposition ? disposition.color : SWATCHES[2],
      description: disposition?.description ?? '',
      isDefault: disposition?.isDefault ?? true
    },
    mode: 'onBlur'
  });
  const busy = form.formState.isSubmitting;

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      name: values.name,
      canonicalOutcome: values.canonicalOutcome,
      color: values.color,
      description: values.description || null,
      isDefault: values.isDefault
    });
  });

  return (
    <FormProvider {...form}>
      <form className='space-y-5' onSubmit={submit}>
        <FormInput
          control={form.control}
          name='name'
          label={t('name')}
          placeholder={t('namePlaceholder')}
          required
          disabled={busy}
        />

        <FormSelect
          control={form.control}
          name='canonicalOutcome'
          label={t('mapsTo')}
          placeholder={t('mapsToPlaceholder')}
          description={outcomeLocked ? t('mapsToLocked') : t('mapsToHint')}
          options={outcomes.map((value) => ({
            value,
            label: labels.outcome(value) ?? value
          }))}
          required
          disabled={busy || outcomeLocked}
        />

        <FormField
          control={form.control}
          name='color'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('color')}</FormLabel>
              <FormControl>
                <div className='flex flex-wrap items-center gap-2'>
                  {SWATCHES.map((swatch) => {
                    const selected =
                      field.value?.toLowerCase() === swatch.toLowerCase();
                    return (
                      <button
                        key={swatch}
                        type='button'
                        disabled={busy}
                        onClick={() => field.onChange(swatch)}
                        aria-label={swatch}
                        aria-pressed={selected}
                        className={cn(
                          'focus-visible:ring-ring flex size-7 items-center justify-center rounded-full ring-offset-2 transition focus-visible:ring-2 focus-visible:outline-none',
                          selected && 'ring-foreground/60 ring-2'
                        )}
                        style={{ backgroundColor: swatch }}
                      >
                        {selected ? (
                          <Check className='size-3.5 text-white' />
                        ) : null}
                      </button>
                    );
                  })}
                  <label className='border-input hover:bg-accent relative flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs'>
                    <span
                      className='size-3.5 rounded-full border'
                      style={{ backgroundColor: field.value ?? 'transparent' }}
                    />
                    {t('customColor')}
                    <input
                      type='color'
                      className='absolute inset-0 cursor-pointer opacity-0'
                      value={field.value ?? '#3B82F6'}
                      disabled={busy}
                      onChange={(event) =>
                        field.onChange(event.target.value.toUpperCase())
                      }
                    />
                  </label>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='h-7 px-2 text-xs'
                    disabled={busy || field.value === null}
                    onClick={() => field.onChange(null)}
                  >
                    {t('noColor')}
                  </Button>
                </div>
              </FormControl>
            </FormItem>
          )}
        />

        <FormTextarea
          control={form.control}
          name='description'
          label={t('descriptionLabel')}
          placeholder={t('descriptionPlaceholder')}
          config={{ rows: 2, maxLength: 300, showCharCount: false }}
          disabled={busy}
        />

        <FormSwitch
          control={form.control}
          name='isDefault'
          label={t('isDefault')}
          description={t('isDefaultHint')}
          disabled={busy}
        />

        <div className='flex justify-end gap-2 border-t pt-4'>
          <Button
            type='button'
            variant='ghost'
            disabled={busy}
            onClick={onCancel}
          >
            {t('cancel')}
          </Button>
          <Button type='submit' disabled={busy}>
            {busy ? t('saving') : disposition ? t('save') : t('create')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
