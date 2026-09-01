'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  BellRing,
  Bot,
  CalendarCheck,
  Mic,
  PhoneCall,
  Plus,
  RotateCw
} from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card } from '@ringee/frontend-shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@ringee/frontend-shared/components/ui/dialog';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useVoiceAgentApi } from '../api';
import { describeApiError } from '../lib/api-error';
import { flagEmoji } from '../lib/voice-format';
import type { VoiceAgent, VoiceAgentType, VoiceAgentTypeInfo } from '../types';
import { AgentStatusBadge } from './agent-status-badge';
import { AgentTypeCards } from './agent-type-cards';

const TYPE_ICONS: Record<VoiceAgentType, typeof CalendarCheck> = {
  appointment_booking: CalendarCheck,
  reminders_notifications: BellRing
};

/** The module's home: the agents you have, and one way to add another. */
export function AgentsList() {
  const t = useTranslations('aiVoiceAgents.list');
  const tCommon = useTranslations('aiVoiceAgents.common');
  const api = useVoiceAgentApi();
  const [types, setTypes] = useState<VoiceAgentTypeInfo[]>([]);
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [voiceFlags, setVoiceFlags] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const [typeList, page, voices] = await Promise.all([
        api.listTypes(),
        api.list(),
        api.listVoices().catch(() => [])
      ]);
      setTypes(typeList);
      setAgents(page.data);
      setVoiceFlags(
        Object.fromEntries(voices.map((v) => [v.id, flagEmoji(v.countryCode)]))
      );
    } catch (error) {
      setFailure(describeApiError(error, t('loadError')));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const titleByType = new Map(types.map((t) => [t.type, t.title]));

  if (loading) {
    return (
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-40 w-full rounded-lg' />
        ))}
      </div>
    );
  }

  if (failure) {
    return (
      <Card className='flex flex-col items-center gap-3 rounded-lg py-12 text-center'>
        <AlertTriangle className='text-destructive size-6' />
        <p className='text-sm'>{failure}</p>
        <Button
          variant='outline'
          size='sm'
          className='rounded-lg'
          onClick={() => void load()}
        >
          <RotateCw className='size-3.5' />
          {tCommon('tryAgain')}
        </Button>
      </Card>
    );
  }

  if (agents.length === 0) {
    return (
      <Card className='flex flex-col items-center gap-4 rounded-lg px-6 py-12 text-center'>
        <div className='bg-primary/10 text-primary flex size-12 items-center justify-center rounded-lg'>
          <Bot className='size-6' />
        </div>
        <div>
          <p className='font-medium'>{t('emptyTitle')}</p>
          <p className='text-muted-foreground text-sm'>{t('emptyHint')}</p>
        </div>
        <AgentTypeCards types={types} className='w-full max-w-2xl' />
      </Card>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Dialog>
          <DialogTrigger asChild>
            <Button className='h-10 rounded-lg'>
              <Plus className='size-4' />
              {t('newAgent')}
            </Button>
          </DialogTrigger>
          <DialogContent className='sm:max-w-2xl'>
            <DialogHeader>
              <DialogTitle>{t('pickTitle')}</DialogTitle>
              <DialogDescription>{t('pickHint')}</DialogDescription>
            </DialogHeader>
            <AgentTypeCards types={types} />
          </DialogContent>
        </Dialog>
      </div>

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {agents.map((agent) => {
          const Icon = TYPE_ICONS[agent.type] ?? Bot;
          return (
            <Card
              key={agent.id}
              className='hover:border-primary/40 flex flex-col gap-3 rounded-lg p-4 transition-colors'
            >
              <div className='flex items-start justify-between gap-2'>
                <div className='flex min-w-0 items-center gap-2'>
                  <div className='bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
                    <Icon className='size-4' />
                  </div>
                  <Link
                    href={`/dashboard/ai-voice-agents/${agent.id}`}
                    className='truncate font-medium hover:underline'
                  >
                    {agent.name}
                  </Link>
                </div>
                <AgentStatusBadge status={agent.status} />
              </div>

              <p className='text-muted-foreground text-sm'>
                {titleByType.get(agent.type) ?? agent.type}
              </p>

              {/* An agent in `error` is not going to answer anything; the
                  reason belongs on the card, not two clicks away. */}
              {agent.status === 'error' && agent.lastError ? (
                <p className='text-destructive line-clamp-2 text-xs'>
                  {agent.lastError}
                </p>
              ) : null}

              <div className='text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
                <span>
                  {agent.voiceId ? (
                    <>
                      <span aria-hidden>{voiceFlags[agent.voiceId] ?? ''}</span>{' '}
                      {agent.voiceLabel ?? t('voiceSet')}
                    </>
                  ) : (
                    t('noVoice')
                  )}
                </span>
                <span className='flex items-center gap-1'>
                  <PhoneCall className='size-3' />
                  {agent.callCount ?? 0}
                </span>
              </div>

              <div className='mt-auto flex gap-2 pt-1'>
                <Button
                  asChild
                  variant='outline'
                  className='h-10 flex-1 rounded-lg'
                >
                  <Link
                    href={`/dashboard/ai-voice-agents/${agent.id}?tab=test`}
                  >
                    <Mic className='size-3.5' />
                    {t('test')}
                  </Link>
                </Button>
                <Button asChild className='h-10 flex-1 rounded-lg'>
                  <Link href={`/dashboard/ai-voice-agents/${agent.id}`}>
                    {tCommon('open')}
                  </Link>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
