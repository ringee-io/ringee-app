'use client';

import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { IconCalendar, IconFilter } from '@tabler/icons-react';
import type {
  InfraNode,
  InfrastructureResourceType,
  UsageRangeKey
} from '../../types';

export interface UsageFilterState {
  range: UsageRangeKey;
  campaignId: string | null;
  numberId: string | null;
  sipDeviceId: string | null;
  memberId: string | null;
}

const RANGE_OPTIONS: { value: UsageRangeKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' }
];

const ALL = 'all';

/** Options drawn from the overview nodes → context-aware by construction. */
function useOptions(nodes: InfraNode[], type: InfrastructureResourceType) {
  return useMemo(
    () =>
      nodes
        .filter((n) => n.type === type && n.referenceId)
        .map((n) => ({ id: n.referenceId as string, name: n.name })),
    [nodes, type]
  );
}

function FilterSelect({
  value,
  placeholder,
  options,
  onChange
}: {
  value: string | null;
  placeholder: string;
  options: { id: string; name: string }[];
  onChange: (v: string | null) => void;
}) {
  if (options.length === 0) return null;
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v) => onChange(v === ALL ? null : v)}
    >
      <SelectTrigger className='h-9 w-auto min-w-[9rem] gap-1.5 text-xs'>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id} className='max-w-[16rem]'>
            <span className='truncate'>{o.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function UsageFilters({
  nodes,
  hasOrg,
  filters,
  onChange
}: {
  nodes: InfraNode[];
  hasOrg: boolean;
  filters: UsageFilterState;
  onChange: (next: UsageFilterState) => void;
}) {
  const campaigns = useOptions(nodes, 'CAMPAIGN');
  const numbers = useOptions(nodes, 'PHONE_NUMBER');
  const devices = useOptions(nodes, 'SIP_DEVICE');
  const members = useOptions(nodes, 'TEAM_MEMBER');
  const set = (patch: Partial<UsageFilterState>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <IconFilter className='text-muted-foreground hidden size-4 sm:block' />

      <Select
        value={filters.range}
        onValueChange={(v) => set({ range: v as UsageRangeKey })}
      >
        <SelectTrigger className='h-9 w-auto min-w-[8rem] gap-1.5 text-xs'>
          <IconCalendar className='size-3.5 opacity-70' />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <FilterSelect
        value={filters.campaignId}
        placeholder='All campaigns'
        options={campaigns}
        onChange={(v) => set({ campaignId: v })}
      />
      <FilterSelect
        value={filters.numberId}
        placeholder='All numbers'
        options={numbers}
        onChange={(v) => set({ numberId: v })}
      />
      <FilterSelect
        value={filters.sipDeviceId}
        placeholder='All devices'
        options={devices}
        onChange={(v) => set({ sipDeviceId: v })}
      />
      {hasOrg ? (
        <FilterSelect
          value={filters.memberId}
          placeholder='All members'
          options={members}
          onChange={(v) => set({ memberId: v })}
        />
      ) : null}
    </div>
  );
}
