'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  Avatar,
  AvatarFallback,
  AvatarImage
} from '@ringee/frontend-shared/components/ui/avatar';
import {
  RESOURCE_META,
  statusTone,
  prettyStatus,
  type StatusTone
} from '../lib/node-config';
import type { Readiness } from '../lib/readiness';
import type { InfraNode } from '../types';

export interface ResourceNodeData extends Record<string, unknown> {
  node: InfraNode;
  /** Precomputed completeness (see lib/readiness). Drives the node's pill. */
  readiness?: Readiness;
}

const TONE_PILL: Record<StatusTone, string> = {
  ok: 'bg-emerald-500/15 text-emerald-400',
  warn: 'bg-amber-500/15 text-amber-400',
  bad: 'bg-red-500/15 text-red-400',
  idle: 'bg-muted text-muted-foreground'
};

const TONE_DOT_PILL: Record<StatusTone, string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  bad: 'bg-red-400',
  idle: 'bg-muted-foreground/60'
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        TONE_PILL[tone]
      )}
    >
      <span className={cn('size-1.5 rounded-full', TONE_DOT_PILL[tone])} />
      {label}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className='bg-muted/60 text-muted-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium'>
      {children}
    </span>
  );
}

export function ResourceNode({ data, selected }: NodeProps) {
  const d = data as ResourceNodeData;
  const node = d.node;
  const meta = RESOURCE_META[node.type];
  const Icon = meta.Icon;
  const m = node.metadata ?? {};

  // Prefer the derived readiness ("Needs number", "Not registered", …); fall
  // back to the raw status so a node always reads sensibly.
  const pillTone = d.readiness?.tone ?? statusTone(node.status);
  const pillLabel = d.readiness?.label ?? prettyStatus(node.status);

  const isOwner = node.type === 'TEAM_MEMBER' && m.role === 'OWNER';
  const isPerson = node.type === 'TEAM_MEMBER';
  const avatarUrl = (m.avatarUrl as string | null) ?? null;

  // Per-type quick facts shown as chips under the title.
  const facts: React.ReactNode[] = [];
  switch (node.type) {
    case 'TEAM_MEMBER':
      if (Number(m.assignedCampaigns ?? 0) > 0)
        facts.push(
          <Chip key='c'>{Number(m.assignedCampaigns)} campaigns</Chip>
        );
      if (Number(m.assignedSipDevices ?? 0) > 0)
        facts.push(<Chip key='d'>{Number(m.assignedSipDevices)} devices</Chip>);
      break;
    case 'PHONE_NUMBER':
      if (m.country) facts.push(<Chip key='co'>{String(m.country)}</Chip>);
      if (m.assignedCampaign)
        facts.push(<Chip key='ca'>→ {String(m.assignedCampaign)}</Chip>);
      break;
    case 'SIP_DEVICE':
      facts.push(
        <Chip key='n'>
          {m.assignedNumber ? String(m.assignedNumber) : 'No number'}
        </Chip>
      );
      break;
    case 'CAMPAIGN':
      facts.push(<Chip key='l'>{Number(m.leads ?? 0)} leads</Chip>);
      if (m.dialerMode)
        facts.push(<Chip key='dm'>{String(m.dialerMode)}</Chip>);
      break;
    case 'NUMBER_POOL':
      facts.push(<Chip key='m'>{Number(m.members ?? 0)} numbers</Chip>);
      break;
    case 'INTEGRATION':
      if (m.provider) facts.push(<Chip key='p'>{String(m.provider)}</Chip>);
      break;
  }

  const typeLabel = isOwner
    ? 'Personal profile'
    : isPerson
      ? m.role
        ? String(m.role)
        : 'Member'
      : meta.label;

  return (
    <div
      className={cn(
        'bg-card text-card-foreground group w-[244px] overflow-hidden rounded-2xl border shadow-sm transition-[transform,box-shadow,border-color] duration-150 ease-out',
        'hover:-translate-y-0.5 hover:shadow-lg',
        selected
          ? cn(
              'border-transparent shadow-lg ring-2 ring-offset-2',
              'ring-offset-background',
              meta.ring
            )
          : 'border-border hover:border-foreground/20'
      )}
    >
      <Handle
        type='target'
        position={Position.Left}
        className='!bg-background !border-muted-foreground/50 !size-2.5 !border-2'
      />

      {/* Accent rail */}
      <div className='flex'>
        <span className={cn('w-1 shrink-0', meta.accent, 'opacity-80')} />
        <div className='min-w-0 flex-1 p-3'>
          <div className='flex items-start gap-2.5'>
            {isPerson ? (
              <Avatar className='size-9 shrink-0 rounded-lg'>
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={node.name} />
                ) : null}
                <AvatarFallback
                  className={cn('rounded-lg text-xs font-semibold', meta.badge)}
                >
                  {initials(node.name)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-lg',
                  meta.badge
                )}
              >
                <Icon className='size-5' />
              </div>
            )}

            <div className='min-w-0 flex-1'>
              <div className='flex items-start justify-between gap-2'>
                <p className='truncate text-sm font-semibold' title={node.name}>
                  {isOwner ? 'You' : node.name}
                </p>
                <StatusPill tone={pillTone} label={pillLabel} />
              </div>
              <p
                className={cn(
                  'truncate text-[11px] font-medium tracking-wide uppercase',
                  isOwner ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {typeLabel}
              </p>
            </div>
          </div>

          {facts.length > 0 ? (
            <div className='mt-2.5 flex flex-wrap gap-1.5'>{facts}</div>
          ) : null}
        </div>
      </div>

      <Handle
        type='source'
        position={Position.Right}
        className='!bg-background !border-muted-foreground/50 !size-2.5 !border-2'
      />
    </div>
  );
}
