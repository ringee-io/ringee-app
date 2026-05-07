'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@ringee/frontend-shared/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@ringee/frontend-shared/components/ui/command';
import { Calendar } from '@ringee/frontend-shared/components/ui/calendar';
import { useDashboardFilters } from '../lib/filters-context';
import type { DashboardRangeKey } from '../lib/types';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useOrganization } from '@clerk/nextjs';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { Check, ChevronsUpDown, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';

const RANGE_KEYS: Record<DashboardRangeKey, string> = {
  today: 'today',
  yesterday: 'yesterday',
  '7d': 'last7Days',
  '30d': 'last30Days',
  this_month: 'thisMonth',
  last_month: 'lastMonth',
  custom: 'custom'
};

const OUTCOME_VALUES = [
  'meeting_booked',
  'sale',
  'interested',
  'follow_up',
  'not_interested',
  'no_answer',
  'voicemail',
  'wrong_number',
  'gatekeeper'
] as const;

export function DashboardFilters() {
  const t = useTranslations('dashboard');
  const { filters, setRange, setScope, setMemberId, setCampaignId, setOutcome } =
    useDashboardFilters();
  const { hasOrg, isOrgAdmin } = useOrgRole();

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <RangeSelector />
      {hasOrg && (
        <Select value={filters.scope} onValueChange={(v) => setScope(v as 'personal' | 'organization')}>
          <SelectTrigger className='h-9 w-[160px]'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='organization'>{t('filters.scope.organization')}</SelectItem>
            <SelectItem value='personal'>{t('filters.scope.personal')}</SelectItem>
          </SelectContent>
        </Select>
      )}
      {hasOrg && isOrgAdmin && filters.scope === 'organization' && (
        <MemberSelectorCompact value={filters.memberId ?? null} onChange={setMemberId} />
      )}
      <CampaignSelector
        value={filters.campaignId ?? null}
        onChange={setCampaignId}
      />
      <Select
        value={filters.outcome ?? 'all'}
        onValueChange={(v) => setOutcome(v === 'all' ? null : v)}
      >
        <SelectTrigger className='h-9 w-[180px]'>
          <SelectValue placeholder={t('filters.allOutcomes')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>{t('filters.allOutcomes')}</SelectItem>
          {OUTCOME_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`outcomes.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RangeSelector() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const { filters, setRange } = useDashboardFilters();
  const [open, setOpen] = React.useState(false);
  const [tempFrom, setTempFrom] = React.useState<Date | undefined>(
    filters.from ? new Date(filters.from) : undefined
  );
  const [tempTo, setTempTo] = React.useState<Date | undefined>(
    filters.to ? new Date(filters.to) : undefined
  );

  const label =
    filters.range === 'custom' && filters.from && filters.to
      ? `${new Date(filters.from).toLocaleDateString()} – ${new Date(
          filters.to
        ).toLocaleDateString()}`
      : t(`ranges.${RANGE_KEYS[filters.range]}`);

  return (
    <div className='flex items-center gap-1'>
      <Select
        value={filters.range}
        onValueChange={(v) => {
          if (v === 'custom') return;
          setRange(v as DashboardRangeKey);
        }}
      >
        <SelectTrigger className='h-9 w-[160px]'>
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(RANGE_KEYS) as DashboardRangeKey[])
            .filter((k) => k !== 'custom')
            .map((k) => (
              <SelectItem key={k} value={k}>
                {t(`ranges.${RANGE_KEYS[k]}`)}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={filters.range === 'custom' ? 'default' : 'outline'}
            size='icon'
            className='h-9 w-9'
            aria-label={t('filters.customRange.aria')}
          >
            <CalendarIcon className='h-4 w-4' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-auto p-0' align='start'>
          <div className='p-3'>
            <p className='text-muted-foreground mb-2 text-xs'>{t('filters.customRange.title')}</p>
            <div className='flex gap-3'>
              <div>
                <p className='text-xs font-medium'>{t('filters.customRange.from')}</p>
                <Calendar mode='single' selected={tempFrom} onSelect={setTempFrom} />
              </div>
              <div>
                <p className='text-xs font-medium'>{t('filters.customRange.to')}</p>
                <Calendar mode='single' selected={tempTo} onSelect={setTempTo} />
              </div>
            </div>
            <div className='mt-2 flex justify-end gap-2'>
              <Button variant='outline' size='sm' onClick={() => setOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button
                size='sm'
                disabled={!tempFrom || !tempTo}
                onClick={() => {
                  if (!tempFrom || !tempTo) return;
                  setRange('custom', {
                    from: tempFrom.toISOString(),
                    to: tempTo.toISOString()
                  });
                  setOpen(false);
                }}
              >
                {tCommon('apply')}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function MemberSelectorCompact({
  value,
  onChange
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const t = useTranslations('dashboard.filters');
  const { organization } = useOrganization();
  const api = useApi();
  const [open, setOpen] = React.useState(false);
  const [members, setMembers] = React.useState<{ id: string; name: string }[]>([]);

  React.useEffect(() => {
    if (!organization) return;
    let active = true;
    organization.getMemberships().then(async (res) => {
      const clerkIds = res.data
        .map((m) => m.publicUserData?.userId)
        .filter(Boolean) as string[];
      if (clerkIds.length === 0) {
        if (active) setMembers([]);
        return;
      }
      const map = await api.get<{ clerkId: string; id: string }[]>(
        `/user/by-clerk-ids?ids=${clerkIds.join(',')}`
      );
      if (!active) return;
      const lookup = new Map(map.map((u) => [u.clerkId, u.id]));
      setMembers(
        res.data.map((m) => {
          const clerkId = m.publicUserData?.userId || '';
          const name =
            `${m.publicUserData?.firstName || ''} ${m.publicUserData?.lastName || ''}`.trim() ||
            m.publicUserData?.identifier ||
            t('memberFallback');
          return { id: lookup.get(clerkId) || '', name };
        })
      );
    });
    return () => {
      active = false;
    };
  }, [organization, api, t]);

  const selected = members.find((m) => m.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' className='h-9 w-[200px] justify-between'>
          <span className='truncate'>{selected?.name ?? t('allMembers')}</span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[220px] p-0'>
        <Command>
          <CommandInput placeholder={t('searchMembers')} />
          <CommandList>
            <CommandEmpty>{t('noMembers')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value='__all__'
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', value === null ? 'opacity-100' : 'opacity-0')} />
                {t('allMembers')}
              </CommandItem>
              {members.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.name}
                  onSelect={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === m.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {m.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CampaignSelector({
  value,
  onChange
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const t = useTranslations('dashboard.filters');
  const api = useApi();
  const [campaigns, setCampaigns] = React.useState<{ id: string; name: string }[] | null>(null);

  React.useEffect(() => {
    let active = true;
    api
      .get<{ id: string; name: string }[]>('/campaigns')
      .then((res) => {
        if (!active) return;
        setCampaigns(Array.isArray(res) ? res : []);
      })
      .catch(() => {
        if (active) setCampaigns([]);
      });
    return () => {
      active = false;
    };
  }, [api]);

  if (!campaigns || campaigns.length === 0) return null;

  return (
    <Select value={value ?? 'all'} onValueChange={(v) => onChange(v === 'all' ? null : v)}>
      <SelectTrigger className='h-9 w-[200px]'>
        <SelectValue placeholder={t('allCampaigns')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='all'>{t('allCampaigns')}</SelectItem>
        {campaigns.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
