'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDropzone } from 'react-dropzone';
import { Loader2, Mic, RefreshCw, Square, Upload, X } from 'lucide-react';
import { useAudioRecorder } from '@ringee/frontend-shared/hooks/use-audio-recorder';
import { encodeBlobToWav } from '@ringee/frontend-shared/lib/audio-wav';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { FormInput } from '@ringee/frontend-shared/components/forms/form-input';
import { FormSelect } from '@ringee/frontend-shared/components/forms/form-select';
import {
  Tabs,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useVoiceAgentApi } from '../api';
import { describeApiError } from '../lib/api-error';
import { languageName } from '../lib/voice-format';
import type {
  VoiceAgentVoice,
  VoiceCloneQuote,
  VoiceCloneReadingSample
} from '../types';

const LANGUAGES = ['en', 'es', 'pt', 'fr', 'de', 'it'] as const;
const MAX_BYTES = 5 * 1024 * 1024;

export function CloneVoiceDialog({
  onClose,
  onCreated,
  defaultLanguage
}: {
  defaultLanguage?: string;
  onClose: () => void;
  onCreated: (voice: VoiceAgentVoice) => void;
}) {
  const t = useTranslations('aiVoiceAgents.voice.clone');
  const locale = useLocale();
  const initialLanguage = defaultLanguage ?? locale.split('-')[0];
  const genders = useTranslations('aiVoiceAgents.voice.genders');
  const api = useVoiceAgentApi();
  const recorder = useAudioRecorder(10);
  const [mode, setMode] = useState('upload');
  const [sample, setSample] = useState<Blob | null>(null);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [encoding, setEncoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<VoiceCloneQuote | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteVersion, setQuoteVersion] = useState(0);
  const [readingSample, setReadingSample] =
    useState<VoiceCloneReadingSample | null>(null);
  const [readingSampleError, setReadingSampleError] = useState(false);
  const [readingSampleVersion, setReadingSampleVersion] = useState(0);
  const generation = useRef(0);
  const request = useRef<{
    signature: string;
    sample: Blob;
    id: string;
  } | null>(null);
  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, t('nameRequired'))
      .max(120, t('nameTooLong')),
    language: z.enum(LANGUAGES),
    gender: z.enum(['female', 'male', 'unspecified'])
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      language:
        LANGUAGES.find((language) => language === initialLanguage) ?? 'en',
      gender: 'unspecified'
    }
  });
  const language = useWatch({ control: form.control, name: 'language' });

  useEffect(() => {
    let active = true;
    setQuote(null);
    setQuoteError(false);
    api.getCloneQuote().then(
      (value) => {
        if (active) setQuote(value);
      },
      () => {
        if (active) setQuoteError(true);
      }
    );
    return () => {
      active = false;
    };
  }, [api, quoteVersion]);

  useEffect(() => {
    let active = true;
    setReadingSample(null);
    setReadingSampleError(false);
    api.getCloneReadingSample(language).then(
      (value) => {
        if (active) setReadingSample(value);
      },
      () => {
        if (active) setReadingSampleError(true);
      }
    );
    return () => {
      active = false;
    };
  }, [api, language, readingSampleVersion]);

  useEffect(() => {
    if (!sample) {
      setSampleUrl(null);
      return;
    }
    const url = URL.createObjectURL(sample);
    setSampleUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sample]);
  useEffect(
    () => () => {
      generation.current++;
    },
    []
  );

  const prepare = useCallback(
    async (raw: Blob) => {
      const attempt = ++generation.current;
      setSample(null);
      setError(null);
      setEncoding(true);
      try {
        if (raw.size > MAX_BYTES) throw new Error(t('fileError'));
        const wav = await encodeBlobToWav(raw, {
          sampleRate: 24000,
          minSeconds: 3,
          maxSeconds: 15
        });
        if (attempt === generation.current) setSample(wav);
      } catch (failure) {
        if (attempt === generation.current) {
          setError(
            failure instanceof RangeError ? t('durationError') : t('fileError')
          );
        }
      } finally {
        if (attempt === generation.current) setEncoding(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (recorder.blob) void prepare(recorder.blob);
  }, [recorder.blob, prepare]);

  const busy =
    saving ||
    encoding ||
    recorder.state === 'requesting' ||
    recorder.state === 'recording';
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'audio/wav': ['.wav'],
      'audio/mpeg': ['.mp3'],
      'audio/flac': ['.flac'],
      'audio/ogg': ['.ogg'],
      'audio/mp4': ['.m4a']
    },
    maxFiles: 1,
    maxSize: MAX_BYTES,
    multiple: false,
    disabled: busy,
    onDropAccepted: (files) => {
      if (files[0]) void prepare(files[0]);
    },
    onDropRejected: () => setError(t('fileError'))
  });

  const clearSample = () => {
    generation.current++;
    recorder.reset();
    setSample(null);
    setError(null);
    setEncoding(false);
  };

  const submit = form.handleSubmit(async (values) => {
    if (!sample || busy || !quote?.canAfford) return;
    setSaving(true);
    setError(null);
    const signature = JSON.stringify([values, quote.amountUsd]);
    if (
      !request.current ||
      request.current.signature !== signature ||
      request.current.sample !== sample
    ) {
      request.current = { signature, sample, id: crypto.randomUUID() };
    }
    try {
      const voice = await api.cloneVoice(sample, {
        ...values,
        requestId: request.current.id,
        expectedPriceUsd: quote.amountUsd
      });
      onCreated(voice);
      onClose();
    } catch (failure) {
      setError(describeApiError(failure, t('createError')));
      if (failure instanceof ApiError && [402, 409].includes(failure.status)) {
        setQuoteVersion((version) => version + 1);
      }
    } finally {
      setSaving(false);
    }
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        className='max-h-[90dvh] overflow-y-auto sm:max-w-xl'
        showCloseButton={!saving}
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className='flex gap-2'>
          <Badge variant='secondary'>Telnyx</Badge>
          <Badge variant='outline'>Ultra</Badge>
        </div>
        <FormProvider {...form}>
          <form onSubmit={submit} className='space-y-5'>
            <FormInput
              control={form.control}
              name='name'
              label={t('name')}
              placeholder={t('namePlaceholder')}
              required
              disabled={saving}
            />
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormSelect
                className='[&_[data-slot=select-trigger]]:w-full'
                control={form.control}
                name='language'
                label={t('language')}
                disabled={saving}
                options={LANGUAGES.map((value) => ({
                  value,
                  label: languageName(value, locale)
                }))}
              />
              <FormSelect
                className='[&_[data-slot=select-trigger]]:w-full'
                control={form.control}
                name='gender'
                label={t('gender')}
                disabled={saving}
                options={(['female', 'male', 'unspecified'] as const).map(
                  (value) => ({ value, label: genders(value) })
                )}
              />
            </div>
            <section
              className='bg-muted/40 space-y-2 rounded-lg border p-4'
              aria-busy={!readingSample && !readingSampleError}
              aria-labelledby='voice-clone-reading-instruction'
            >
              <p
                id='voice-clone-reading-instruction'
                className='text-sm font-semibold'
              >
                {t('readAloud')}
              </p>
              {!readingSample && !readingSampleError ? (
                <p
                  role='status'
                  className='text-muted-foreground flex min-h-14 items-center gap-2 text-sm'
                >
                  <Loader2 className='size-4 animate-spin' />
                  {t('generatingSample')}
                </p>
              ) : null}
              {readingSample ? (
                <p
                  lang={readingSample.language}
                  className='min-h-14 text-base leading-7'
                >
                  {readingSample.text}
                </p>
              ) : null}
              {readingSampleError ? (
                <div className='flex min-h-14 flex-wrap items-center justify-between gap-2'>
                  <p role='alert' className='text-destructive text-sm'>
                    {t('sampleError')}
                  </p>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={saving}
                    onClick={() =>
                      setReadingSampleVersion((version) => version + 1)
                    }
                  >
                    <RefreshCw className='size-4' />
                    {t('retrySample')}
                  </Button>
                </div>
              ) : null}
            </section>
            <div className='space-y-3'>
              <Tabs
                value={mode}
                onValueChange={(next) => {
                  clearSample();
                  setMode(next);
                }}
              >
                <TabsList
                  className='grid w-full grid-cols-2'
                  aria-label={t('source')}
                >
                  <TabsTrigger value='upload' disabled={busy}>
                    <Upload className='mr-2 size-4' />
                    {t('upload')}
                  </TabsTrigger>
                  <TabsTrigger value='record' disabled={busy}>
                    <Mic className='mr-2 size-4' />
                    {t('record')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <p className='text-muted-foreground text-sm'>{t('sampleHint')}</p>
              {mode === 'upload' && !sampleUrl ? (
                <div
                  {...getRootProps()}
                  className={cn(
                    'focus-visible:ring-ring flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-5 text-center focus-visible:ring-2 focus-visible:outline-none',
                    isDragActive
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/40',
                    busy && 'pointer-events-none opacity-60'
                  )}
                >
                  <input {...getInputProps()} aria-label={t('upload')} />
                  <Upload className='text-muted-foreground size-6' />
                  <span className='text-sm font-medium'>{t('drop')}</span>
                  <span className='text-muted-foreground text-xs'>
                    {t('formats')}
                  </span>
                </div>
              ) : null}
              {mode === 'record' && !sampleUrl ? (
                <div className='flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg border p-5'>
                  <p className='text-muted-foreground text-center text-sm'>
                    {t('recordHint')}
                  </p>
                  <span
                    className='font-mono text-xl tabular-nums'
                    aria-live='off'
                  >
                    {recorder.seconds.toFixed(1)} / 10 s
                  </span>
                  <Button
                    type='button'
                    variant={
                      recorder.state === 'recording'
                        ? 'destructive'
                        : 'secondary'
                    }
                    disabled={
                      saving ||
                      encoding ||
                      recorder.state === 'requesting' ||
                      !readingSample
                    }
                    onClick={() => {
                      setError(null);
                      if (recorder.state === 'recording') recorder.stop();
                      else void recorder.start();
                    }}
                  >
                    {recorder.state === 'recording' ? (
                      <Square className='size-4' />
                    ) : (
                      <Mic className='size-4' />
                    )}
                    {recorder.state === 'recording' ? t('stop') : t('start')}
                  </Button>
                </div>
              ) : null}
              {encoding ? (
                <p
                  role='status'
                  className='text-muted-foreground flex items-center gap-2 text-sm'
                >
                  <Loader2 className='size-4 animate-spin' />
                  {t('preparing')}
                </p>
              ) : null}
              {sampleUrl ? (
                <div className='space-y-3 rounded-lg border p-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='text-sm font-medium'>
                      {t('reference')}
                    </span>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      aria-label={t('remove')}
                      disabled={saving}
                      onClick={clearSample}
                    >
                      <X className='size-4' />
                    </Button>
                  </div>
                  <audio
                    controls
                    src={sampleUrl}
                    className='w-full'
                    aria-label={t('reference')}
                  />
                </div>
              ) : null}
              <p className='text-muted-foreground text-xs'>{t('trimHint')}</p>
            </div>
            {error ||
            recorder.state === 'denied' ||
            recorder.state === 'failed' ? (
              <p role='alert' className='text-destructive text-sm'>
                {error ??
                  t(recorder.state === 'denied' ? 'micDenied' : 'recordError')}
              </p>
            ) : null}
            {quote && quote.amountUsd > 0 ? (
              <div
                className='bg-muted/40 space-y-1 rounded-lg border p-3 text-sm'
                aria-live='polite'
              >
                <p className='font-medium'>
                  {t('price', {
                    price: new Intl.NumberFormat(locale, {
                      style: 'currency',
                      currency: quote.currency,
                      currencyDisplay: 'code',
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6
                    }).format(quote.amountUsd)
                  })}
                </p>
                <p className='text-muted-foreground'>{t('priceHint')}</p>
                {!quote.canAfford ? (
                  <p role='alert' className='text-destructive'>
                    {t('insufficientCredit')}
                  </p>
                ) : null}
              </div>
            ) : null}
            {quoteError ? (
              <p role='alert' className='text-destructive text-sm'>
                {t('priceError')}
              </p>
            ) : null}
            {quoteError || (quote && !quote.canAfford) ? (
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={saving}
                onClick={() => setQuoteVersion((version) => version + 1)}
              >
                {t('refreshPrice')}
              </Button>
            ) : null}
            <div className='flex justify-end gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={saving}
                onClick={onClose}
              >
                {t('cancel')}
              </Button>
              <Button
                type='submit'
                disabled={!sample || busy || !quote?.canAfford}
              >
                {saving ? <Loader2 className='size-4 animate-spin' /> : null}
                {saving ? t('creating') : t('create')}
              </Button>
            </div>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
