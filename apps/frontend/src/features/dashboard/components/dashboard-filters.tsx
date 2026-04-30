'use client';

import * as React from 'react';
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

const RANGE_LABEL: Record<DashboardRangeKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  this_month: 'This month',
  last_month: 'Last month',
  custom: 'Custom range'
};

const OUTCOMES = [
  { value: 'meeting_booked', label: 'Meeting Booked' },
  { value: 'sale', label: 'Sale' },
  { value: 'interested', label: 'Interested' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'gatekeeper', label: 'Gatekeeper' }
];

export function DashboardFilters() {
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
            <SelectItem value='organization'>Organization</SelectItem>
            <SelectItem value='personal'>Personal</SelectItem>
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
          <SelectValue placeholder='All outcomes' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>All outcomes</SelectItem>
          {OUTCOMES.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RangeSelector() {
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
      : RANGE_LABEL[filters.range];

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
          {(Object.keys(RANGE_LABEL) as DashboardRangeKey[])
            .filter((k) => k !== 'custom')
            .map((k) => (
              <SelectItem key={k} value={k}>
                {RANGE_LABEL[k]}
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
            aria-label='Custom range'
          >
            <CalendarIcon className='h-4 w-4' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-auto p-0' align='start'>
          <div className='p-3'>
            <p className='text-muted-foreground mb-2 text-xs'>Pick a custom range</p>
            <div className='flex gap-3'>
              <div>
                <p className='text-xs font-medium'>From</p>
                <Calendar mode='single' selected={tempFrom} onSelect={setTempFrom} />
              </div>
              <div>
                <p className='text-xs font-medium'>To</p>
                <Calendar mode='single' selected={tempTo} onSelect={setTempTo} />
              </div>
            </div>
            <div className='mt-2 flex justify-end gap-2'>
              <Button variant='outline' size='sm' onClick={() => setOpen(false)}>
                Cancel
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
                Apply
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
            'Member';
          return { id: lookup.get(clerkId) || '', name };
        })
      );
    });
    return () => {
      active = false;
    };
  }, [organization]);

  const selected = members.find((m) => m.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' className='h-9 w-[200px] justify-between'>
          <span className='truncate'>{selected?.name ?? 'All members'}</span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[220px] p-0'>
        <Command>
          <CommandInput placeholder='Search members…' />
          <CommandList>
            <CommandEmpty>No members</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value='__all__'
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', value === null ? 'opacity-100' : 'opacity-0')} />
                All members
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
        <SelectValue placeholder='All campaigns' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='all'>All campaigns</SelectItem>
        {campaigns.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
