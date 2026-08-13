'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  Loader2,
  ExternalLink,
  Check,
  Unplug,
  CalendarDays
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface CalendarIntegration {
  id: string;
  provider: 'google' | 'microsoft';
  email?: string;
  isActive: boolean;
  createdAt: string;
}

const PROVIDERS = [
  {
    id: 'google' as const,
    nameKey: 'google.name',
    descriptionKey: 'google.description',
    icon: (
      <svg viewBox='0 0 24 24' className='h-6 w-6' fill='none'>
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
    ),
    color: 'border-blue-500/30',
    activeGlow: 'shadow-[inset_0_0_20px_rgba(66,133,244,0.08)]'
  },
  {
    id: 'microsoft' as const,
    nameKey: 'microsoft.name',
    descriptionKey: 'microsoft.description',
    icon: (
      <svg viewBox='0 0 24 24' className='h-6 w-6' fill='none'>
        <path d='M11.4 24H0V12L11.4 0v24z' fill='#0078D4' />
        <path d='M24 24H11.4V12L24 0v24z' fill='#0078D4' opacity='0.7' />
        <path d='M11.4 12H0L11.4 0v12z' fill='#28A8EA' />
        <path d='M24 12H11.4L24 0v12z' fill='#0078D4' opacity='0.5' />
      </svg>
    ),
    color: 'border-sky-500/30',
    activeGlow: 'shadow-[inset_0_0_20px_rgba(0,120,212,0.08)]'
  }
];

export function CalendarIntegrations() {
  const api = useApi();
  const t = useTranslations('meetings.integrations');
  const [integrations, setIntegrations] = useState<CalendarIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<CalendarIntegration[]>(
        '/calendar/integrations'
      );
      setIntegrations(data);
    } catch {
      // No integrations or API error
      setIntegrations([]);
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // Check URL params for OAuth callback status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const calendarStatus = params.get('calendar');
    const provider = params.get('provider');

    if (calendarStatus === 'connected' && provider) {
      toast.success(
        t('connectedSuccess', { provider: t(`providers.${provider}.name`) })
      );
      fetchIntegrations();
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('calendar');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', url.toString());
    } else if (calendarStatus === 'error') {
      toast.error(t('connectFailed'));
      const url = new URL(window.location.href);
      url.searchParams.delete('calendar');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', url.toString());
    }
  }, [fetchIntegrations]);

  const handleConnect = (provider: 'google' | 'microsoft') => {
    // Redirect to the backend OAuth route — auth token is sent via cookie
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    window.location.href = `${apiBase}/calendar/oauth/${provider}`;
  };

  const handleDisconnect = async (integration: CalendarIntegration) => {
    setDisconnectingId(integration.id);
    try {
      await api.delete(`/calendar/integrations/${integration.id}`);
      toast.success(t('disconnected'));
      setIntegrations((prev) => prev.filter((i) => i.id !== integration.id));
    } catch {
      toast.error(t('disconnectFailed'));
    } finally {
      setDisconnectingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className='grid gap-4 md:grid-cols-2'>
        {[0, 1].map((i) => (
          <div
            key={i}
            className='border-border/20 bg-card rounded-xl border p-6'
          >
            <div className='flex items-center gap-4'>
              <Skeleton className='h-12 w-12 rounded-xl' />
              <div className='flex-1 space-y-2'>
                <Skeleton className='h-5 w-32' />
                <Skeleton className='h-3 w-48' />
              </div>
            </div>
            <Skeleton className='mt-6 h-9 w-full' />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className='relative'>
      <div className='space-y-6'>
        {/* Header */}
        <div>
          <h3 className='text-base font-semibold'>{t('title')}</h3>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('description')}
          </p>
        </div>

        {/* Provider cards */}
        <div className='grid gap-4 md:grid-cols-2'>
          {PROVIDERS.map((provider) => {
            const connected = integrations.find(
              (i) => i.provider === provider.id && i.isActive
            );
            const isDisconnecting = disconnectingId === connected?.id;
            const isComingSoon = provider.id === 'microsoft';

            return (
              <div
                key={provider.id}
                className={cn(
                  'group bg-card relative overflow-hidden rounded-xl border p-6 transition-all',
                  connected
                    ? `${provider.color} ${provider.activeGlow}`
                    : 'border-border/20 hover:border-border/40',
                  isComingSoon &&
                    'pointer-events-none opacity-80 grayscale-[30%] select-none'
                )}
              >
                {/* Coming Soon Overlay */}
                {isComingSoon && (
                  <div className='bg-background/50 absolute inset-0 z-20 flex flex-col items-center justify-center backdrop-blur-[1.5px]'>
                    <div className='border-primary/20 bg-card/95 rounded-full border px-3 py-1 shadow-sm'>
                      <span className='text-primary text-[10px] font-bold tracking-widest uppercase'>
                        ✨ {t('comingSoon')}
                      </span>
                    </div>
                  </div>
                )}
                {/* Connected badge */}
                {connected && (
                  <div className='absolute top-4 right-4'>
                    <Badge
                      variant='secondary'
                      className='gap-1 border-emerald-500/20 bg-emerald-500/10 text-[10px] text-emerald-400'
                    >
                      <Check className='h-3 w-3' />
                      {t('connected')}
                    </Badge>
                  </div>
                )}

                {/* Icon + info */}
                <div className='flex items-start gap-4'>
                  <div
                    className={cn(
                      'bg-muted/30 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors',
                      connected && 'bg-muted/50'
                    )}
                  >
                    {provider.icon}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <h4 className='text-sm font-semibold'>
                      {t(`providers.${provider.nameKey}`)}
                    </h4>
                    <p className='text-muted-foreground mt-0.5 text-xs leading-relaxed'>
                      {t(`providers.${provider.descriptionKey}`)}
                    </p>
                    {connected?.email && (
                      <p className='text-foreground/80 mt-2 truncate text-xs font-medium'>
                        {connected.email}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action */}
                <div className='mt-5'>
                  {connected ? (
                    <Button
                      variant='outline'
                      size='sm'
                      className='border-border/30 w-full gap-2 text-xs transition-all hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-400'
                      onClick={() => handleDisconnect(connected)}
                      disabled={isDisconnecting}
                    >
                      {isDisconnecting ? (
                        <Loader2 className='h-3.5 w-3.5 animate-spin' />
                      ) : (
                        <Unplug className='h-3.5 w-3.5' />
                      )}
                      {t('disconnect')}
                    </Button>
                  ) : (
                    <Button
                      size='sm'
                      className='bg-primary hover:bg-primary/90 w-full gap-2 text-xs transition-all'
                      onClick={() => handleConnect(provider.id)}
                    >
                      <ExternalLink className='h-3.5 w-3.5' />
                      {t('connect', {
                        provider: t(`providers.${provider.nameKey}`)
                      })}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sync info */}
        <div className='border-border/10 bg-muted/5 rounded-xl border p-4'>
          <div className='flex items-start gap-3'>
            <CalendarDays className='text-muted-foreground mt-0.5 h-5 w-5 shrink-0' />
            <div>
              <p className='text-xs font-medium'>{t('howItWorks')}</p>
              <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
                {t('howItWorksPrefix')}{' '}
                <span className='text-foreground font-medium'>Google Meet</span>{' '}
                {t('or')}{' '}
                <span className='text-foreground font-medium'>
                  Microsoft Teams
                </span>{' '}
                {t('howItWorksSuffix')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
