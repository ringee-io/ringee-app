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
  CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';

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
    name: 'Google Calendar',
    description: 'Sync meetings with Google Calendar and auto-create Google Meet links.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
    color: 'border-blue-500/30',
    activeGlow: 'shadow-[inset_0_0_20px_rgba(66,133,244,0.08)]',
  },
  {
    id: 'microsoft' as const,
    name: 'Microsoft Outlook',
    description: 'Sync meetings with Outlook Calendar and auto-create Teams links.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
        <path d="M11.4 24H0V12L11.4 0v24z" fill="#0078D4"/>
        <path d="M24 24H11.4V12L24 0v24z" fill="#0078D4" opacity="0.7"/>
        <path d="M11.4 12H0L11.4 0v12z" fill="#28A8EA"/>
        <path d="M24 12H11.4L24 0v12z" fill="#0078D4" opacity="0.5"/>
      </svg>
    ),
    color: 'border-sky-500/30',
    activeGlow: 'shadow-[inset_0_0_20px_rgba(0,120,212,0.08)]',
  },
];

export function CalendarIntegrations() {
  const api = useApi();
  const [integrations, setIntegrations] = useState<CalendarIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<CalendarIntegration[]>('/calendar/integrations');
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
      toast.success(`${provider === 'google' ? 'Google Calendar' : 'Microsoft Outlook'} connected successfully!`);
      fetchIntegrations();
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('calendar');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', url.toString());
    } else if (calendarStatus === 'error') {
      toast.error('Failed to connect calendar. Please try again.');
      const url = new URL(window.location.href);
      url.searchParams.delete('calendar');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', url.toString());
    }
  }, [fetchIntegrations]);

  const handleConnect = (provider: 'google' | 'microsoft') => {
    // Redirect to the backend OAuth route — auth token is sent via cookie
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    window.location.href = `${apiBase}/calendar/oauth/${provider}`;
  };

  const handleDisconnect = async (integration: CalendarIntegration) => {
    setDisconnectingId(integration.id);
    try {
      await api.delete(`/calendar/integrations/${integration.id}`);
      toast.success('Calendar disconnected');
      setIntegrations((prev) => prev.filter((i) => i.id !== integration.id));
    } catch {
      toast.error('Failed to disconnect calendar');
    } finally {
      setDisconnectingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className='grid gap-4 md:grid-cols-2'>
        {[0, 1].map((i) => (
          <div key={i} className='rounded-xl border border-border/20 bg-card p-6'>
            <div className='flex items-center gap-4'>
              <Skeleton className='h-12 w-12 rounded-xl' />
              <div className='space-y-2 flex-1'>
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
      {/* Coming Soon Overlay */}
      <div className='absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-background/10 backdrop-blur-[1px] transition-all duration-500'>
        <div className='flex flex-col items-center justify-center space-y-5 rounded-xl border border-primary/10 bg-card/95 p-8 text-center shadow-[0_0_40px_-10px_rgba(0,0,0,0.1)] backdrop-blur-md max-w-[480px] mx-auto animate-in fade-in zoom-in-95 duration-500'>
          <span className='text-primary border-primary/20 text-xs px-3 py-1 tracking-widest uppercase font-semibold'>
            ✨ Coming Soon
          </span>
          <div className='space-y-3'>
            <h4 className='text-xl font-bold tracking-tight'>Awaiting Official Verification</h4>
            <p className='text-muted-foreground text-sm leading-relaxed max-w-[420px] mx-auto'>
              We've fully built the <strong className="text-foreground font-medium">Google Calendar</strong> and <strong className="text-foreground font-medium">Microsoft Outlook</strong> integrations! We are currently waiting for standard app compliance verification from their security teams.
            </p>
            <p className='text-muted-foreground/80 text-xs max-w-[360px] mx-auto pt-1'>
              Once approved, you'll be able to seamlessly sync meetings and auto-generate Meet/Teams video links with one click.
            </p>
          </div>
        </div>
      </div>

      {/* Content Wrapper */}
      <div className='space-y-6 pointer-events-none select-none opacity-50 grayscale-[10%] blur-[1px]'>
        {/* Header */}
      <div>
        <h3 className='text-base font-semibold'>Calendar Integrations</h3>
        <p className='text-muted-foreground text-sm mt-1'>
          Connect your calendar to auto-sync meetings booked during cold calls and check availability in real-time.
        </p>
      </div>

      {/* Provider cards */}
      <div className='grid gap-4 md:grid-cols-2'>
        {PROVIDERS.map((provider) => {
          const connected = integrations.find((i) => i.provider === provider.id && i.isActive);
          const isDisconnecting = disconnectingId === connected?.id;

          return (
            <div
              key={provider.id}
              className={cn(
                'group relative rounded-xl border bg-card p-6 transition-all',
                connected
                  ? `${provider.color} ${provider.activeGlow}`
                  : 'border-border/20 hover:border-border/40'
              )}
            >
              {/* Connected badge */}
              {connected && (
                <div className='absolute top-4 right-4'>
                  <Badge variant='secondary' className='gap-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]'>
                    <Check className='h-3 w-3' />
                    Connected
                  </Badge>
                </div>
              )}

              {/* Icon + info */}
              <div className='flex items-start gap-4'>
                <div className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted/30 transition-colors',
                  connected && 'bg-muted/50'
                )}>
                  {provider.icon}
                </div>
                <div className='min-w-0 flex-1'>
                  <h4 className='text-sm font-semibold'>{provider.name}</h4>
                  <p className='text-muted-foreground text-xs mt-0.5 leading-relaxed'>
                    {provider.description}
                  </p>
                  {connected?.email && (
                    <p className='text-xs font-medium mt-2 text-foreground/80 truncate'>
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
                    className='w-full gap-2 text-xs border-border/30 hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/5 transition-all'
                    onClick={() => handleDisconnect(connected)}
                    disabled={isDisconnecting}
                  >
                    {isDisconnecting ? (
                      <Loader2 className='h-3.5 w-3.5 animate-spin' />
                    ) : (
                      <Unplug className='h-3.5 w-3.5' />
                    )}
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    size='sm'
                    className='w-full gap-2 text-xs bg-primary hover:bg-primary/90 transition-all'
                    onClick={() => handleConnect(provider.id)}
                  >
                    <ExternalLink className='h-3.5 w-3.5' />
                    Connect {provider.name}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sync info */}
      <div className='rounded-xl border border-border/10 bg-muted/5 p-4'>
        <div className='flex items-start gap-3'>
          <CalendarDays className='h-5 w-5 text-muted-foreground shrink-0 mt-0.5' />
          <div>
            <p className='text-xs font-medium'>How it works</p>
            <p className='text-muted-foreground text-xs mt-1 leading-relaxed'>
              When you book a meeting during a cold call, Ringee automatically creates a calendar event with a{' '}
              <span className='text-foreground font-medium'>Google Meet</span> or{' '}
              <span className='text-foreground font-medium'>Microsoft Teams</span> link.
              Your availability is also checked in real-time when scheduling.
            </p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
