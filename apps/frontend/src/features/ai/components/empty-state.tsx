'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useUser } from '@clerk/nextjs';
import {
  IconBolt,
  IconCheck,
  IconLoader2,
  IconSend,
  IconSparkles,
  IconTargetArrow,
  IconUsers
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { EnrichmentConnectDialog } from '@/features/integrations/components/enrichment-connect-dialog';
import {
  ENRICHMENT_PROVIDER_META,
  type EnrichmentConnectionSummary,
  type EnrichmentProviderType
} from '@/features/integrations/types/enrichment';
import type { ProspectingMode } from '../types';

interface ProspectingModeCard {
  id: ProspectingMode;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** When true, the mode can be submitted with an empty input — the
   *  `modes.<id>.seed` message is sent instead. */
  hasSeed?: boolean;
}

/**
 * The prospecting entry modes. Display copy (title, tagline, placeholder,
 * example, seed) lives in the `ai.modes.<id>` translation namespace.
 */
const PROSPECTING_MODES: ProspectingModeCard[] = [
  { id: 'icp', icon: IconTargetArrow },
  { id: 'customers', icon: IconUsers, hasSeed: true },
  { id: 'signals', icon: IconBolt }
];

interface Props {
  onSubmit: (text: string, mode: ProspectingMode) => void;
  sending?: boolean;
}

interface CalendarIntegration {
  id: string;
  provider: 'google' | 'microsoft';
  email?: string;
  isActive: boolean;
}

/** Returns the `ai.emptyState.*` greeting key for the given local time. */
function greetingKey(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return 'greetingLateNight';
  if (hour < 12) return 'greetingMorning';
  if (hour < 18) return 'greetingAfternoon';
  return 'greetingEvening';
}

export function EmptyState({ onSubmit, sending }: Props) {
  const t = useTranslations('ai');
  const { user } = useUser();
  const [mode, setMode] = useState<ProspectingMode>('icp');
  const [value, setValue] = useState('');
  const firstName = user?.firstName?.trim() ?? '';

  const activeMode =
    PROSPECTING_MODES.find((m) => m.id === mode) ?? PROSPECTING_MODES[0];
  // ICP and signals need a description; the customers mode can run off the
  // user's Ringee history alone, so it submits a seed message instead.
  const seed = activeMode.hasSeed ? t(`modes.${activeMode.id}.seed`) : '';
  const trimmed = value.trim();
  const canSubmit = !sending && (trimmed.length > 0 || Boolean(seed));

  const greeting = t(`emptyState.${greetingKey(new Date())}`);

  function submit() {
    if (sending) return;
    const text = trimmed || seed;
    if (!text) return;
    onSubmit(text, mode);
    setValue('');
  }

  return (
    <div className='flex flex-1 flex-col items-center overflow-y-auto px-6 py-10'>
      <div className='flex w-full max-w-2xl flex-col items-center'>
        <div className='mt-10 flex items-center gap-3'>
          <Image
            src='/android-chrome-192x192.png'
            alt='Ringee'
            width={44}
            height={44}
            className='ring-border/60 h-10 w-10 rounded-full ring-1'
          />
          <h1 className='font-serif text-3xl font-medium tracking-tight md:text-4xl'>
            {firstName
              ? t('emptyState.greetingWithName', {
                  greeting,
                  name: firstName
                })
              : greeting}
          </h1>
        </div>

        <p className='text-muted-foreground mt-3 text-sm'>
          {t('emptyState.prompt')}
        </p>

        <div className='mt-5 grid w-full gap-2.5 sm:grid-cols-3'>
          {PROSPECTING_MODES.map((m) => {
            const Icon = m.icon;
            const selected = m.id === mode;
            return (
              <button
                key={m.id}
                type='button'
                onClick={() => setMode(m.id)}
                aria-pressed={selected}
                className={`flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all ${
                  selected
                    ? 'border-primary bg-primary/5 ring-primary/30 shadow-sm ring-1'
                    : 'border-border/60 bg-background hover:border-border hover:bg-muted/50'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                    selected
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon size={15} />
                </span>
                <span className='text-sm leading-tight font-medium'>
                  {t(`modes.${m.id}.title`)}
                </span>
                <span className='text-muted-foreground text-xs'>
                  {t(`modes.${m.id}.tagline`)}
                </span>
              </button>
            );
          })}
        </div>

        <div className='mt-4 w-full'>
          <div className='group border-border/60 bg-muted/30 focus-within:border-border focus-within:bg-muted/50 relative overflow-hidden rounded-lg border shadow-sm transition-all focus-within:shadow-md'>
            <Textarea
              value={value}
              placeholder={t(`modes.${mode}.placeholder`)}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={3}
              className='min-h-[96px] resize-none border-0 bg-transparent px-5 pt-4 pb-12 text-base shadow-none focus-visible:ring-0 dark:bg-transparent'
            />
            <div className='pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-3 py-2'>
              <div className='text-muted-foreground pointer-events-auto flex items-center gap-1.5 text-xs'>
                <IconSparkles size={12} className='text-primary' />
                <span className='hidden sm:inline'>
                  {t(`modes.${mode}.title`)}
                </span>
              </div>
              <Button
                onClick={submit}
                disabled={!canSubmit}
                size='icon'
                className='pointer-events-auto h-9 w-9 rounded-lg'
              >
                {sending ? (
                  <IconLoader2 size={16} className='animate-spin' />
                ) : (
                  <IconSend size={16} />
                )}
              </Button>
            </div>
          </div>

          <button
            type='button'
            onClick={() => setValue(t(`modes.${mode}.example`))}
            className='text-muted-foreground hover:text-foreground mt-2 flex w-full items-start gap-1.5 rounded-lg px-1 text-left text-xs transition-colors'
          >
            <span className='text-primary/80 shrink-0 font-medium'>
              {t('emptyState.example')}
            </span>
            <span className='line-clamp-2'>{t(`modes.${mode}.example`)}</span>
          </button>
        </div>

        <EnrichmentSection />
        <CalendarSection />
      </div>
    </div>
  );
}

function CalendarSection() {
  const t = useTranslations('ai.emptyState');
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const [integration, setIntegration] = useState<CalendarIntegration | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.get<CalendarIntegration[]>(
          '/calendar/integrations'
        );
        if (cancelled) return;
        const google = data.find((d) => d.provider === 'google' && d.isActive);
        setIntegration(google ?? null);
      } catch {
        if (!cancelled) setIntegration(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  function handleConnect() {
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    window.location.href = `${apiBase}/calendar/oauth/google`;
  }

  return (
    <section className='mt-14 flex w-full flex-col items-center text-center'>
      <h2 className='text-foreground text-base font-medium'>
        {t('calendarTitle')}
      </h2>
      <p className='text-muted-foreground mt-1 text-xs'>
        {t('calendarDescription')}
      </p>
      <div className='mt-4'>
        {loading ? (
          <div className='bg-muted/40 h-9 w-44 animate-pulse rounded-lg' />
        ) : integration ? (
          <div className='inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-300'>
            <IconCheck size={13} />
            <span className='font-medium'>{t('calendarConnected')}</span>
            {integration.email && (
              <span className='text-muted-foreground'>
                · {integration.email}
              </span>
            )}
          </div>
        ) : (
          <Button
            variant='outline'
            onClick={handleConnect}
            className='border-border/70 h-9 gap-2 rounded-lg px-4 text-sm font-medium'
          >
            <GoogleGlyph />
            {t('calendarConnect')}
          </Button>
        )}
      </div>
    </section>
  );
}

function EnrichmentSection() {
  const t = useTranslations('ai.emptyState');
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<EnrichmentConnectionSummary[]>(
    []
  );

  const load = async () => {
    try {
      const data = await api.get<EnrichmentConnectionSummary[]>(
        '/enrichment/connections'
      );
      setConnections(data ?? []);
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const providers: EnrichmentProviderType[] = ['apollo', 'prospeo'];

  return (
    <section className='mt-12 flex w-full flex-col items-center text-center'>
      <h2 className='text-foreground text-base font-medium'>
        {t('enrichmentTitle')}
      </h2>
      <p className='text-muted-foreground mt-1 text-xs'>
        {t('enrichmentDescription')}
      </p>
      <div className='mt-4 flex flex-wrap items-center justify-center gap-2'>
        {loading
          ? providers.map((p) => (
              <div
                key={p}
                className='bg-muted/40 h-9 w-36 animate-pulse rounded-lg'
              />
            ))
          : providers.map((p) => {
              const meta = ENRICHMENT_PROVIDER_META[p];
              const connected = connections.some(
                (c) => c.provider === p && c.status !== 'disconnected'
              );
              if (connected) {
                return (
                  <div
                    key={p}
                    className='inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-300'
                  >
                    <ProviderLogo provider={p} />
                    <IconCheck size={13} />
                    <span className='font-medium'>
                      {t('enrichmentConnected', { provider: meta.name })}
                    </span>
                  </div>
                );
              }
              return (
                <div
                  key={p}
                  className='border-border/70 bg-background inline-flex items-center gap-4 rounded-lg border px-3 py-1.5'
                >
                  <ProviderLogo provider={p} />
                  <span className='text-sm font-medium'>{meta.name}</span>
                  <EnrichmentConnectDialog
                    provider={p}
                    alreadyConnected={false}
                    onConnected={() => void load()}
                  />
                </div>
              );
            })}
      </div>
    </section>
  );
}

function ProviderLogo({ provider }: { provider: EnrichmentProviderType }) {
  const src =
    provider === 'apollo' ? '/companies/apollo.png' : '/companies/prospeo.svg';
  const meta = ENRICHMENT_PROVIDER_META[provider];
  return (
    <Image
      src={src}
      alt={meta.name}
      width={16}
      height={16}
      className='h-4 w-4 object-contain'
    />
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox='0 0 24 24' className='h-4 w-4' aria-hidden>
      <path
        d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z'
        fill='#4285F4'
      />
      <path
        d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
        fill='#34A853'
      />
      <path
        d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'
        fill='#FBBC05'
      />
      <path
        d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
        fill='#EA4335'
      />
    </svg>
  );
}
