'use client';

import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { FormInput } from '@ringee/frontend-shared/components/forms/form-input';
import { FormSelect } from '@ringee/frontend-shared/components/forms/form-select';
import { SettingsSectionHeading } from '@/features/settings/components/panels/general-panel';
import type {
  EndpointInput,
  ExternalNumber,
  NumberInput,
  SipEndpoint
} from '../types';

function FormActions({
  busy,
  onCancel,
  connect = false
}: {
  busy: boolean;
  onCancel: () => void;
  connect?: boolean;
}) {
  const t = useTranslations('settings.byoc');
  return (
    <div className='flex justify-end gap-2 border-t pt-4'>
      <Button type='button' variant='ghost' disabled={busy} onClick={onCancel}>
        {t('cancel')}
      </Button>
      <Button type='submit' disabled={busy}>
        {t(busy ? 'saving' : connect ? 'connect' : 'save')}
      </Button>
    </div>
  );
}

export function CarrierForm({
  name = '',
  busy,
  onSave,
  onCancel
}: {
  name?: string;
  busy: boolean;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('settings.byoc');
  const schema = z.object({
    name: z.string().trim().min(1, t('required')).max(80, t('tooLong'))
  });
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name },
    mode: 'onBlur'
  });
  return (
    <FormProvider {...form}>
      <form
        className='space-y-5'
        onSubmit={form.handleSubmit((values) => onSave(values.name))}
      >
        <FormInput
          control={form.control}
          name='name'
          label={t('carrierName')}
          placeholder={t('carrierPlaceholder')}
          required
          disabled={busy}
        />
        <FormActions busy={busy} onCancel={onCancel} />
      </form>
    </FormProvider>
  );
}

export function EndpointForm({
  endpoint,
  busy,
  onSave,
  onCancel
}: {
  endpoint?: SipEndpoint;
  busy: boolean;
  onSave: (input: EndpointInput) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('settings.byoc');
  const schema = z.object({
    extension: z
      .string()
      .trim()
      .min(1, t('required'))
      .max(64, t('tooLong'))
      .regex(/^[a-zA-Z0-9_.+*-]+$/, t('invalidExtension')),
    proxy: z.string().trim().min(1, t('required')).max(260, t('tooLong')),
    sipUsername: z.string().trim().min(1, t('required')).max(128, t('tooLong')),
    password: z
      .string()
      .max(256, t('tooLong'))
      .refine((value) => Boolean(endpoint) || value.length > 0, t('required')),
    transport: z.enum(['TLS', 'TCP', 'UDP']),
    authUsername: z.string().max(128, t('tooLong')),
    fromUser: z.string().max(128, t('tooLong')),
    outboundProxy: z.string().max(260, t('tooLong')),
    expirationSec: z
      .number()
      .int()
      .min(60, t('invalidExpiry'))
      .max(86400, t('invalidExpiry'))
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      extension: endpoint?.extension ?? '',
      proxy: endpoint?.proxy ?? '',
      sipUsername: endpoint?.sipUsername ?? '',
      password: '',
      transport: endpoint?.transport ?? 'TLS',
      authUsername: endpoint?.authUsername ?? '',
      fromUser: endpoint?.fromUser ?? '',
      outboundProxy: endpoint?.outboundProxy ?? '',
      expirationSec: endpoint?.expirationSec ?? 600
    }
  });
  return (
    <FormProvider {...form}>
      <form
        className='space-y-6'
        onSubmit={form.handleSubmit(async (values) => {
          await onSave({
            ...values,
            password: values.password || undefined,
            authUsername: values.authUsername || null,
            fromUser: values.fromUser || null,
            outboundProxy: values.outboundProxy || null
          });
          form.resetField('password');
        })}
      >
        <section className='space-y-3'>
          <SettingsSectionHeading>{t('identity')}</SettingsSectionHeading>
          <FormInput
            control={form.control}
            name='extension'
            label={t('extension')}
            placeholder='201'
            description={t('extensionHelp')}
            required
            disabled={busy}
          />
        </section>
        <section className='space-y-3'>
          <SettingsSectionHeading>{t('sipConnection')}</SettingsSectionHeading>
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormInput
              control={form.control}
              name='proxy'
              label={t('proxy')}
              placeholder='sip.example.com:5061'
              required
              disabled={busy}
            />
            <FormSelect
              control={form.control}
              name='transport'
              label={t('transport')}
              options={['TLS', 'TCP', 'UDP'].map((value) => ({
                value,
                label: value
              }))}
              disabled={busy}
            />
            <FormInput
              control={form.control}
              name='sipUsername'
              label={t('username')}
              required
              disabled={busy}
            />
            <FormInput
              control={form.control}
              name='password'
              label={t('password')}
              type='password'
              description={t(endpoint ? 'passwordKeep' : 'passwordHelp')}
              required={!endpoint}
              disabled={busy}
            />
          </div>
        </section>
        <details
          className='border-border/60 rounded-lg border px-4 py-3'
          open={
            Object.keys(form.formState.errors).some((key) =>
              [
                'authUsername',
                'fromUser',
                'outboundProxy',
                'expirationSec'
              ].includes(key)
            ) || undefined
          }
        >
          <summary className='focus-visible:ring-ring cursor-pointer text-sm font-medium focus-visible:ring-2'>
            {t('advanced')}
          </summary>
          <div className='mt-4 grid gap-4 sm:grid-cols-2'>
            <FormInput
              control={form.control}
              name='authUsername'
              label={t('authUsername')}
              disabled={busy}
            />
            <FormInput
              control={form.control}
              name='fromUser'
              label={t('fromUser')}
              disabled={busy}
            />
            <FormInput
              control={form.control}
              name='outboundProxy'
              label={t('outboundProxy')}
              placeholder='outbound.example.com:5061'
              disabled={busy}
            />
            <FormInput
              control={form.control}
              name='expirationSec'
              label={t('expiry')}
              type='number'
              min={60}
              max={86400}
              disabled={busy}
            />
          </div>
        </details>
        <FormActions busy={busy} onCancel={onCancel} connect={!endpoint} />
      </form>
    </FormProvider>
  );
}

export function NumberForm({
  endpoints,
  number,
  endpointId,
  busy,
  onSave,
  onCancel
}: {
  endpoints: SipEndpoint[];
  number?: ExternalNumber;
  endpointId?: string;
  busy: boolean;
  onSave: (input: NumberInput) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('settings.byoc');
  const schema = z.object({
    endpointId: z.string().min(1, t('required')),
    phoneNumber: z
      .string()
      .trim()
      .regex(/^\+[\d ()-]{7,25}$/, t('invalidPhone')),
    active: z.enum(['active', 'inactive'])
  });
  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      endpointId: endpointId ?? endpoints[0]?.id ?? '',
      phoneNumber: number?.phoneNumber ?? '',
      active:
        number?.active === false ? ('inactive' as const) : ('active' as const)
    }
  });
  return (
    <FormProvider {...form}>
      <form
        className='space-y-5'
        onSubmit={form.handleSubmit((values) =>
          onSave({ ...values, active: values.active === 'active' })
        )}
      >
        <FormInput
          control={form.control}
          name='phoneNumber'
          label={t('phoneNumber')}
          placeholder='+1 305 555 0101'
          type='tel'
          description={t('numberHelp')}
          required
          disabled={busy}
        />
        <FormSelect
          control={form.control}
          name='endpointId'
          label={t('extension')}
          options={endpoints
            .filter((row) => row.syncStatus !== 'deleting')
            .map((row) => ({
              value: row.id,
              label: t('extensionLabel', { extension: row.extension })
            }))}
          description={t('sharedExtensionHelp')}
          required
          disabled={busy}
        />
        <FormSelect
          control={form.control}
          name='active'
          label={t('numberState')}
          options={['active', 'inactive'].map((value) => ({
            value,
            label: t(value)
          }))}
          disabled={busy}
        />
        <FormActions busy={busy} onCancel={onCancel} />
      </form>
    </FormProvider>
  );
}
