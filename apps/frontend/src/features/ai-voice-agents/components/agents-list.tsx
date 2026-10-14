'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  BellRing,
  Bot,
  CalendarCheck,
  Eye,
  Mic,
  PhoneCall,
  PhoneIncoming,
  Plus,
  RotateCw,
  Search
} from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { CopyIdMenuItem } from '@ringee/frontend-shared/components/ui/copy-id-menu-item';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@ringee/frontend-shared/components/ui/dialog';
import { DropdownMenuItem } from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { useVoiceAgentApi } from '../api';
import { describeApiError } from '../lib/api-error';
import { flagEmoji } from '../lib/voice-format';
import type {
  VoiceAgent,
  VoiceAgentStatus,
  VoiceAgentType,
  VoiceAgentTypeInfo
} from '../types';
import { AgentStatusBadge } from './agent-status-badge';
import { AgentTypeCards } from './agent-type-cards';

const TYPE_ICONS: Record<VoiceAgentType, typeof CalendarCheck> = {
  appointment_booking: CalendarCheck,
  reminders_notifications: BellRing,
  receptionist: PhoneIncoming
};

const STATUSES: VoiceAgentStatus[] = ['active', 'draft', 'disabled', 'error'];

/**
 * One agent, laid out like a campaign card: the whole card opens it and the
 * rest of what you can do sits behind its actions menu, so a page of agents
 * does not turn into a wall of buttons.
 */
function AgentCard({
  agent,
  typeTitle,
  voiceFlag
}: {
  agent: VoiceAgent;
  typeTitle: string;
  voiceFlag: string;
}) {
  const t = useTranslations('aiVoiceAgents.list');
  const tCommon = useTranslations('common');
  const Icon = TYPE_ICONS[agent.type] ?? Bot;
  const href = `/dashboard/ai-voice-agents/${agent.id}`;

  return (
    <Card className='relative gap-4 transition-shadow hover:shadow-md'>
      <CardHeader className='flex items-start justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-3'>
          <div className='bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg'>
            <Icon className='size-4' />
          </div>
          <div className='min-w-0 space-y-1'>
            <CardTitle className='truncate text-lg'>
              {/* Stretched over the card: the whole card opens the agent. */}
              <Link
                href={href}
                className='focus-visible:ring-ring rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:ring-2'
              >
                {agent.name}
              </Link>
            </CardTitle>
            <CardDescription className='truncate'>{typeTitle}</CardDescription>
          </div>
        </div>
        {/* Above the stretched link, so the menu opens instead of the agent. */}
        <div className='relative z-10 flex shrink-0 items-center gap-1'>
          <AgentStatusBadge status={agent.status} />
          <TableRowActions
            label={tCommon('openActions')}
            menuLabel={tCommon('actions')}
          >
            <DropdownMenuItem asChild>
              <Link href={href}>
                <Eye className='h-4 w-4' />
                {tCommon('view')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`${href}?tab=test`}>
                <Mic className='h-4 w-4' />
                {t('test')}
              </Link>
            </DropdownMenuItem>
            <CopyIdMenuItem id={agent.id} />
          </TableRowActions>
        </div>
      </CardHeader>
      <CardContent className='space-y-2'>
        {/* An agent in `error` is not going to answer anything; the reason
            belongs on the card, not two clicks away. */}
        {agent.status === 'error' && agent.lastError ? (
          <p className='text-destructive line-clamp-2 text-xs'>
            {agent.lastError}
          </p>
        ) : null}
        <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm'>
          <span className='flex min-w-0 items-center gap-1'>
            {agent.voiceId ? (
              <>
                <span aria-hidden>{voiceFlag}</span>
                <span className='truncate'>
                  {agent.voiceLabel ?? t('voiceSet')}
                </span>
              </>
            ) : (
              t('noVoice')
            )}
          </span>
          <span className='flex items-center gap-1'>
            <PhoneCall className='h-4 w-4' />
            {t('calls', { count: agent.callCount ?? 0 })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentListSkeleton() {
  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className='gap-4'>
          <CardHeader>
            <Skeleton className='h-6 w-3/4' />
            <Skeleton className='h-4 w-1/2' />
          </CardHeader>
          <CardContent>
            <Skeleton className='h-4 w-full' />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** The module's home: the agents you have, and one way to add another. */
export function AgentsList() {
  const t = useTranslations('aiVoiceAgents.list');
  const tCommon = useTranslations('aiVoiceAgents.common');
  const tStatus = useTranslations('aiVoiceAgents.status');
  const api = useVoiceAgentApi();
  // UX only: creating an agent is admin-only on the server (AGENT-018).
  const { canAccessAdminFeatures: canCreate } = useOrgRole();
  const [types, setTypes] = useState<VoiceAgentTypeInfo[]>([]);
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [voiceFlags, setVoiceFlags] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VoiceAgentStatus | 'all'>(
    'all'
  );

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
  const query = search.trim().toLowerCase();
  const visible = agents.filter(
    (agent) =>
      (statusFilter === 'all' || agent.status === statusFilter) &&
      (!query ||
        agent.name.toLowerCase().includes(query) ||
        (titleByType.get(agent.type) ?? '').toLowerCase().includes(query))
  );

  if (loading) return <AgentListSkeleton />;

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
          <p className='text-muted-foreground text-sm'>
            {canCreate ? t('emptyHint') : t('createAskAdmin')}
          </p>
        </div>
        {canCreate ? (
          <AgentTypeCards types={types} className='w-full max-w-2xl' />
        ) : null}
      </Card>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row'>
        <div className='relative flex-1'>
          <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
          <Input
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className='pl-9'
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as VoiceAgentStatus | 'all')
          }
        >
          <SelectTrigger className='w-full sm:w-[160px]'>
            <SelectValue placeholder={t('allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('allStatuses')}</SelectItem>
            {STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {tStatus(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canCreate ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className='mr-2 h-4 w-4' />
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
        ) : null}
      </div>

      {visible.length === 0 ? (
        <Card className='items-center py-12 text-center'>
          <p className='text-muted-foreground text-sm'>{t('noMatches')}</p>
        </Card>
      ) : (
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
          {visible.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              typeTitle={titleByType.get(agent.type) ?? agent.type}
              voiceFlag={agent.voiceId ? (voiceFlags[agent.voiceId] ?? '') : ''}
            />
          ))}
        </div>
      )}
    </div>
  );
}
