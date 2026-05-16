'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useUser } from '@clerk/nextjs';
import {
  IconChartBar,
  IconCheck,
  IconLoader2,
  IconLock,
  IconSearch,
  IconSend,
  IconSparkles,
  IconTargetArrow,
  IconUserSearch
} from '@tabler/icons-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { EnrichmentConnectDialog } from '@/features/integrations/components/enrichment-connect-dialog';
import {
  ENRICHMENT_PROVIDER_META,
  type EnrichmentConnectionSummary,
  type EnrichmentProviderType
} from '@/features/integrations/types/enrichment';

const QUICK_PROMPTS: Array<{
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  text: string;
}> = [
  {
    icon: IconTargetArrow,
    label: 'Find decision-makers',
    text: 'I want to reach Heads of Sales at 50-200 person B2B SaaS companies in France that have an outbound team. Help me build the strongest search and find the top 25 leads.'
  },
  {
    icon: IconChartBar,
    label: 'Lookalike from won deals',
    text: 'Analyze my past won deals in Ringee and recommend 2 or 3 lookalike search strategies. Then run the one most likely to convert.'
  },
  {
    icon: IconSearch,
    label: 'Refine a vague target',
    text: "I want to sell to founders in LATAM with an international outbound sales team. Translate this into concrete filters (titles, industries, country codes, company size) and run the search."
  },
  {
    icon: IconUserSearch,
    label: 'Search by industry',
    text: 'Find me 25 prospects in the fintech industry, Series A or B, based in Western Europe. Score them by likelihood to need outbound calling software.'
  }
];

interface Props {
  providersConnected: string[];
  onPick: (text: string) => void;
  onSubmit: (text: string) => void;
  sending?: boolean;
}

interface CalendarIntegration {
  id: string;
  provider: 'google' | 'microsoft';
  email?: string;
  isActive: boolean;
}

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

export function EmptyState({
  providersConnected,
  onPick,
  onSubmit,
  sending
}: Props) {
  const { user } = useUser();
  const [value, setValue] = useState('');
  const firstName = user?.firstName?.trim() ?? '';

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    onSubmit(trimmed);
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
            className='h-10 w-10 rounded-full ring-1 ring-border/60'
          />
          <h1 className='text-3xl font-serif font-medium tracking-tight md:text-4xl'>
            {greetingFor(new Date())}
            {firstName ? `, ${firstName}` : ''}
          </h1>
        </div>

        <div className='mt-8 w-full'>
          <div className='group relative overflow-hidden rounded-lg border border-border/60 bg-muted/30 shadow-sm transition-all focus-within:border-border focus-within:bg-muted/50 focus-within:shadow-md'>
            <Textarea
              value={value}
              placeholder='How can I help you today?'
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={3}
              className='min-h-[88px] resize-none border-0 bg-transparent px-5 pb-12 pt-4 text-base shadow-none focus-visible:ring-0 dark:bg-transparent'
            />
            <div className='pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-3 py-2'>
              <div className='pointer-events-auto flex items-center gap-1.5 text-xs text-muted-foreground'>
                <IconSparkles size={12} className='text-primary' />
                <span className='hidden sm:inline'>Prospecting Expert</span>
              </div>
              <Button
                onClick={submit}
                disabled={!value.trim() || sending}
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
        </div>

        <div className='mt-5 flex flex-wrap items-center justify-center gap-2'>
          {QUICK_PROMPTS.map(({ icon: Icon, label, text }) => (
            <button
              key={label}
              type='button'
              onClick={() => {
                setValue(text);
                onPick(text);
              }}
              className='inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground'
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        <CalendarSection />
        <EnrichmentSection />
      </div>
    </div>
  );
}

function CalendarSection() {
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
      <h2 className='text-base font-medium text-foreground'>
        Book meetings straight from your calls
      </h2>
      <p className='mt-1 text-xs text-muted-foreground'>
        Sync your calendar so Ringee can schedule meetings live during calls
        and check your real-time availability.
      </p>
      <div className='mt-4'>
        {loading ? (
          <div className='h-9 w-44 animate-pulse rounded-lg bg-muted/40' />
        ) : integration ? (
          <div className='inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-300'>
            <IconCheck size={13} />
            <span className='font-medium'>Google Calendar connected</span>
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
            className='h-9 gap-2 rounded-lg border-border/70 px-4 text-sm font-medium'
          >
            <GoogleGlyph />
            Sync Google Account
          </Button>
        )}
      </div>
    </section>
  );
}

function EnrichmentSection() {
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
      <h2 className='text-base font-medium text-foreground'>
        Unlock prospect search
      </h2>
      <p className='mt-1 text-xs text-muted-foreground'>
        Connect a provider so Ringee can find and reveal contacts for you.
      </p>
      <div className='mt-4 flex flex-wrap items-center justify-center gap-2'>
        {loading
          ? providers.map((p) => (
              <div
                key={p}
                className='h-9 w-36 animate-pulse rounded-lg bg-muted/40'
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
                    <span className='font-medium'>{meta.name} connected</span>
                  </div>
                );
              }
              return (
                <div
                  key={p}
                  className='inline-flex items-center gap-4 rounded-lg border border-border/70 bg-background px-3 py-1.5'
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
