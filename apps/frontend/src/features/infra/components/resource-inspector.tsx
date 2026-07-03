'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent
} from '@ringee/frontend-shared/components/ui/tabs';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import {
  Avatar,
  AvatarFallback,
  AvatarImage
} from '@ringee/frontend-shared/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  IconExternalLink,
  IconCopy,
  IconX,
  IconPlus,
  IconRefresh,
  IconDotsVertical,
  IconEyeOff,
  IconKey,
  IconRoute,
  IconFileText,
  IconPhone,
  IconPlayerPlay,
  IconPlayerPause,
  IconUsersGroup,
  IconInbox,
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleDashed,
  type IconProps
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { useInfraApi } from '../api';
import { useInfraStore } from '../store/infra.store';
import { useEntities } from '../lib/use-entities';
import { contentVariants, SPRING } from '../lib/motion';
import {
  RESOURCE_META,
  TONE_DOT,
  TAB_LABEL,
  dashboardHref,
  getInspectorTabs,
  statusTone,
  type InspectorTab,
  type StatusTone
} from '../lib/node-config';
import {
  buildAdjacency,
  nodeReadiness,
  type NodeAdjacency,
  type Readiness,
  type ReadinessState
} from '../lib/readiness';
import type {
  InfraEdge,
  InfraEvent,
  InfraLinkableItem,
  InfraNode,
  InfraNumberDocuments,
  InfrastructureResourceType
} from '../types';

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const TONE_PILL: Record<StatusTone, string> = {
  ok: 'bg-emerald-500/15 text-emerald-400',
  warn: 'bg-amber-500/15 text-amber-400',
  bad: 'bg-red-500/15 text-red-400',
  idle: 'bg-muted text-muted-foreground'
};

function prettyStatus(status: string): string {
  const s = status.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Compact status chip used in the inspector header. */
function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
        TONE_PILL[tone]
      )}
    >
      <span className={cn('size-1.5 rounded-full', TONE_DOT[tone])} />
      {prettyStatus(status)}
    </span>
  );
}

const BANNER_TONE: Record<StatusTone, string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/10',
  warn: 'border-amber-500/30 bg-amber-500/10',
  bad: 'border-red-500/30 bg-red-500/10',
  idle: 'border-border bg-muted/30'
};

const FIX_LABEL: Partial<Record<ReadinessState, string>> = {
  needs_number: 'Assign a number',
  needs_agents: 'Assign agents',
  needs_routing: 'Configure routing',
  needs_documents: 'Submit documents',
  needs_payment: 'Complete payment',
  not_registered: 'View registration',
  no_campaign: 'Assign to a campaign'
};

const FIX_ICON: Partial<Record<InspectorTab, ComponentType<IconProps>>> = {
  routing: IconRoute,
  numbers: IconPhone,
  agents: IconUsersGroup,
  campaigns: IconUsersGroup,
  documents: IconFileText,
  billing: IconFileText,
  registration: IconKey
};

/** "Current setup" — the human relationships a node has, read from live edges. */
function connectionRows(
  node: InfraNode,
  adj: NodeAdjacency | undefined
): { label: string; value: string }[] {
  const names = (t: InfrastructureResourceType) =>
    (adj?.neighborsByType[t] ?? []).map((n) => n.name);
  const rows: { label: string; value: string }[] = [];
  switch (node.type) {
    case 'PHONE_NUMBER':
      if (names('CAMPAIGN').length)
        rows.push({ label: 'Used by', value: names('CAMPAIGN').join(', ') });
      if (names('SIP_DEVICE').length)
        rows.push({
          label: 'Routes to',
          value: names('SIP_DEVICE').join(', ')
        });
      if (names('TEAM_MEMBER').length)
        rows.push({
          label: 'Routes to',
          value: names('TEAM_MEMBER').join(', ')
        });
      if (names('NUMBER_POOL').length)
        rows.push({ label: 'In pool', value: names('NUMBER_POOL').join(', ') });
      break;
    case 'CAMPAIGN':
      rows.push({
        label: 'Agents',
        value: String(adj?.count.TEAM_MEMBER ?? 0)
      });
      rows.push({
        label: 'Number',
        value: names('PHONE_NUMBER').join(', ') || 'None'
      });
      rows.push({ label: 'Leads', value: String(node.metadata?.leads ?? 0) });
      break;
    case 'TEAM_MEMBER':
      if (names('CAMPAIGN').length)
        rows.push({ label: 'Campaigns', value: names('CAMPAIGN').join(', ') });
      if (names('SIP_DEVICE').length)
        rows.push({ label: 'Devices', value: names('SIP_DEVICE').join(', ') });
      break;
    case 'SIP_DEVICE':
      if (names('TEAM_MEMBER').length)
        rows.push({ label: 'Owner', value: names('TEAM_MEMBER').join(', ') });
      if (names('PHONE_NUMBER').length)
        rows.push({ label: 'Number', value: names('PHONE_NUMBER').join(', ') });
      break;
  }
  return rows;
}

interface Requirement {
  label: string;
  met: boolean;
}

/**
 * The concrete checklist behind a node's readiness — "Number ✓ / Agents ✗" —
 * so the inspector spells out exactly what a resource still needs. Derived from
 * the same adjacency + status the readiness banner uses.
 */
function resourceRequirements(
  node: InfraNode,
  adj: NodeAdjacency | undefined,
  hasOrg: boolean
): Requirement[] {
  const has = (t: InfrastructureResourceType) => adj?.types.has(t) ?? false;
  const m = node.metadata ?? {};
  const s = node.status.toLowerCase();
  switch (node.type) {
    case 'PHONE_NUMBER':
      return [
        {
          label: 'Regulatory documents',
          met: !(
            s.includes('document') ||
            s === 'pending' ||
            s === 'under_review' ||
            s === 'order_created' ||
            s.includes('payment')
          )
        },
        {
          label: 'Routed to a campaign or device',
          met: has('CAMPAIGN') || has('SIP_DEVICE') || has('TEAM_MEMBER')
        }
      ];
    case 'CAMPAIGN': {
      const reqs: Requirement[] = [
        { label: 'Has a phone number', met: has('PHONE_NUMBER') }
      ];
      if (hasOrg)
        reqs.push({ label: 'Has assigned agents', met: has('TEAM_MEMBER') });
      reqs.push({
        label: 'Running',
        met: ['active', 'running'].includes(s)
      });
      return reqs;
    }
    case 'SIP_DEVICE':
      return [
        {
          label: 'Registered',
          met: s === 'registered' || !!m.lastRegisteredAt
        },
        {
          label: 'Has a number',
          met: !!m.assignedNumber || has('PHONE_NUMBER')
        }
      ];
    case 'TEAM_MEMBER': {
      const isOwner = m.role === 'OWNER' || !hasOrg;
      if (isOwner) return [];
      return [
        {
          label: 'Assigned to a campaign',
          met: Number(m.assignedCampaigns ?? 0) > 0 || has('CAMPAIGN')
        }
      ];
    }
    default:
      return [];
  }
}

/** Renders the requirement checklist as ticked / dashed rows. */
function RequirementList({ items }: { items: Requirement[] }) {
  return (
    <div>
      <p className='text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wide uppercase'>
        Requirements
      </p>
      <FieldCard>
        {items.map((it) => (
          <div
            key={it.label}
            className='flex items-center gap-2.5 border-b py-2.5 last:border-0'
          >
            {it.met ? (
              <IconCircleCheck className='size-4 shrink-0 text-emerald-500' />
            ) : (
              <IconCircleDashed className='text-muted-foreground/50 size-4 shrink-0' />
            )}
            <span
              className={cn('text-sm', it.met ? '' : 'text-muted-foreground')}
            >
              {it.label}
            </span>
            <span
              className={cn(
                'ml-auto text-[11px] font-medium',
                it.met ? 'text-emerald-500' : 'text-amber-500'
              )}
            >
              {it.met ? 'Ready' : 'Missing'}
            </span>
          </div>
        ))}
      </FieldCard>
    </div>
  );
}

/** Headline "is this ready, and what's missing?" banner in the Overview tab. */
function ReadinessBanner({
  readiness,
  canMutate,
  onFix
}: {
  readiness: Readiness;
  canMutate: boolean;
  onFix: (tab: InspectorTab) => void;
}) {
  const Icon = readiness.incomplete ? IconAlertTriangle : IconCircleCheck;
  const iconColor =
    readiness.tone === 'ok'
      ? 'text-emerald-500'
      : readiness.tone === 'bad'
        ? 'text-red-500'
        : readiness.tone === 'warn'
          ? 'text-amber-500'
          : 'text-muted-foreground';
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border p-3',
        BANNER_TONE[readiness.tone]
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', iconColor)} />
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-medium'>{readiness.label}</p>
        {readiness.hint ? (
          <p className='text-muted-foreground text-xs'>{readiness.hint}</p>
        ) : null}
      </div>
      {readiness.fixTab && canMutate && readiness.incomplete ? (
        <Button
          size='sm'
          variant='outline'
          className='h-7 shrink-0 px-2.5 text-xs'
          onClick={() => onFix(readiness.fixTab!)}
        >
          Fix
        </Button>
      ) : null}
    </div>
  );
}

/** A titled group that wraps related fields into a single premium surface. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-3 border-b py-2.5 last:border-0'>
      <span className='text-muted-foreground text-sm'>{label}</span>
      <span className='truncate text-right text-sm font-medium'>
        {value ?? '—'}
      </span>
    </div>
  );
}

/** Card that groups a set of read-only fields (e.g. the Overview tab). */
function FieldCard({ children }: { children: React.ReactNode }) {
  return (
    <div className='bg-muted/30 rounded-xl border px-3.5 py-1'>{children}</div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='bg-muted/30 rounded-xl border p-3.5'>
      <p className='text-2xl font-semibold tabular-nums'>{value}</p>
      <p className='text-muted-foreground mt-0.5 text-xs'>{label}</p>
    </div>
  );
}

/** Elegant in-tab empty state — icon + one line, optional helper below. */
function MiniEmpty({
  icon: Icon = IconInbox,
  children
}: {
  icon?: ComponentType<IconProps>;
  children: React.ReactNode;
}) {
  return (
    <div className='text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center'>
      <Icon className='size-5 opacity-60' />
      <p className='text-sm'>{children}</p>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='space-y-1'>
      <Label className='text-xs'>{label}</Label>
      <div className='flex gap-2'>
        <Input readOnly value={value} className='font-mono text-xs' />
        <Button
          size='icon'
          variant='outline'
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success(`${label} copied.`);
          }}
        >
          <IconCopy className='size-4' />
        </Button>
      </div>
    </div>
  );
}

/**
 * Assign/unassign a related resource from an inspector tab. "Connected" is read
 * from the live edges (so it reflects real DB relationships after a refetch);
 * candidates are every workspace entity of the target type not yet connected.
 */
function AssignSection({
  node,
  targetType,
  nodes,
  edges,
  entities,
  canMutate,
  onChanged
}: {
  node: InfraNode;
  targetType: InfrastructureResourceType;
  nodes: InfraNode[];
  edges: InfraEdge[];
  entities: InfraLinkableItem[];
  canMutate: boolean;
  onChanged: () => Promise<void>;
}) {
  const api = useInfraApi();
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const connected = useMemo(() => {
    const out: InfraNode[] = [];
    const seen = new Set<string>();
    for (const e of edges) {
      const otherId =
        e.source === node.id
          ? e.target
          : e.target === node.id
            ? e.source
            : null;
      if (!otherId) continue;
      const other = nodeById.get(otherId);
      if (!other || other.type !== targetType) continue;
      if (seen.has(other.id)) continue;
      seen.add(other.id);
      out.push(other);
    }
    return out;
  }, [edges, node.id, nodeById, targetType]);

  const connectedRefs = new Set(connected.map((n) => n.referenceId));
  const candidates = entities.filter(
    (e) => e.type === targetType && !connectedRefs.has(e.referenceId)
  );

  const assign = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const res = await api.assign(node.id, targetType, pick);
      toast[res.applied ? 'success' : 'info'](res.message);
      setPick('');
      await onChanged();
    } catch {
      toast.error('Could not assign that resource.');
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (referenceId: string | null) => {
    if (!referenceId) return;
    setBusy(true);
    try {
      await api.unassign(node.id, targetType, referenceId);
      toast.success('Removed.');
      await onChanged();
    } catch {
      toast.error('Could not remove that connection.');
    } finally {
      setBusy(false);
    }
  };

  const meta = RESOURCE_META[targetType];

  return (
    <div className='space-y-3'>
      {connected.length === 0 ? (
        <MiniEmpty icon={meta.Icon}>
          No {meta.label.toLowerCase()} connected yet.
        </MiniEmpty>
      ) : (
        <ul className='space-y-1.5'>
          {connected.map((c) => (
            <li
              key={c.id}
              className='bg-muted/30 hover:border-foreground/15 flex items-center justify-between gap-2 rounded-lg border p-2.5 transition-colors'
            >
              <span className='truncate text-sm'>{c.name}</span>
              {canMutate ? (
                <Button
                  size='icon'
                  variant='ghost'
                  className='size-7'
                  disabled={busy}
                  onClick={() => unassign(c.referenceId)}
                >
                  <IconX className='size-4' />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canMutate ? (
        <div className='flex gap-2'>
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className='flex-1'>
              <SelectValue placeholder={`Add ${meta.label.toLowerCase()}…`} />
            </SelectTrigger>
            <SelectContent>
              {candidates.length === 0 ? (
                <div className='text-muted-foreground px-2 py-1.5 text-xs'>
                  Nothing to add.
                </div>
              ) : (
                candidates.map((c) => (
                  <SelectItem key={c.referenceId} value={c.referenceId}>
                    {c.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button onClick={assign} disabled={busy || !pick}>
            Assign
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ResourceInspector({
  node: selectedNode,
  tab,
  hasOrg,
  onTabChange,
  onClose,
  onRefetch,
  nodes,
  edges,
  onOpenCreate,
  canMutate
}: {
  node: InfraNode | null;
  tab: InspectorTab;
  hasOrg: boolean;
  onTabChange: (tab: InspectorTab) => void;
  onClose: () => void;
  onRefetch: () => Promise<void>;
  nodes: InfraNode[];
  edges: InfraEdge[];
  onOpenCreate: (type: InfrastructureResourceType) => void;
  canMutate: boolean;
}) {
  const api = useInfraApi();
  const reduce = useReducedMotion();
  const { credentialsByResource, setCredentials } = useInfraStore();
  const { entities } = useEntities(!!selectedNode);

  // Keep the last node mounted through the close transition.
  const [view, setView] = useState<InfraNode | null>(selectedNode);
  const [shown, setShown] = useState(false);

  // Derived completeness + live relationships for the "setup hub" header.
  const adjacency = useMemo(() => buildAdjacency(nodes, edges), [nodes, edges]);
  const readiness = useMemo(
    () => (view ? nodeReadiness(view, adjacency.get(view.id), hasOrg) : null),
    [view, adjacency, hasOrg]
  );
  const connRows = useMemo(
    () => (view ? connectionRows(view, adjacency.get(view.id)) : []),
    [view, adjacency]
  );
  const requirements = useMemo(
    () =>
      view ? resourceRequirements(view, adjacency.get(view.id), hasOrg) : [],
    [view, adjacency, hasOrg]
  );

  const [events, setEvents] = useState<InfraEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [docs, setDocs] = useState<InfraNumberDocuments | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  // Campaign config form
  const [cName, setCName] = useState('');
  const [cMax, setCMax] = useState('');

  useEffect(() => {
    if (selectedNode) {
      setView(selectedNode);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setView(null), 220);
    return () => clearTimeout(t);
  }, [selectedNode]);

  useEffect(() => {
    if (!selectedNode) return;
    setLabel(selectedNode.name);
    setCName(selectedNode.name);
    setCMax(String((selectedNode.metadata?.maxAttempts as number) ?? ''));
  }, [selectedNode]);

  useEffect(() => {
    if (!selectedNode || tab !== 'logs') return;
    let cancelled = false;
    setLoadingEvents(true);
    api
      .listEvents(selectedNode.id)
      .then((rows) => !cancelled && setEvents(rows))
      .catch(() => !cancelled && setEvents([]))
      .finally(() => !cancelled && setLoadingEvents(false));
    return () => {
      cancelled = true;
    };
  }, [selectedNode, tab, api]);

  useEffect(() => {
    if (
      !selectedNode ||
      tab !== 'documents' ||
      selectedNode.type !== 'PHONE_NUMBER'
    )
      return;
    let cancelled = false;
    setLoadingDocs(true);
    api
      .getDocuments(selectedNode.id)
      .then((d) => !cancelled && setDocs(d))
      .catch(() => !cancelled && setDocs(null))
      .finally(() => !cancelled && setLoadingDocs(false));
    return () => {
      cancelled = true;
    };
  }, [selectedNode, tab, api]);

  if (!view) return null;

  const node = view;
  const meta = RESOURCE_META[node.type];
  const Icon = meta.Icon;
  const m = node.metadata ?? {};
  const tabs = getInspectorTabs(node.type, { hasOrg });
  const credentials = credentialsByResource[node.id];

  const isOwner = node.type === 'TEAM_MEMBER' && m.role === 'OWNER';
  const isPerson = node.type === 'TEAM_MEMBER';
  const title = isOwner ? 'You' : node.name;
  const subtitle = isOwner
    ? 'Personal profile'
    : isPerson
      ? m.role
        ? String(m.role)
        : hasOrg
          ? 'Agent'
          : 'Team member'
      : meta.label;

  const refetch = () => onRefetch();

  const saveLabel = async () => {
    if (!label.trim() || label === node.name) return;
    setSaving(true);
    try {
      await api.rename(node.id, label.trim());
      toast.success('Renamed.');
      await refetch();
    } catch {
      toast.error('Could not rename.');
    } finally {
      setSaving(false);
    }
  };

  const saveCampaign = async () => {
    setSaving(true);
    try {
      await api.updateConfiguration(node.id, {
        campaignSettings: {
          name: cName.trim() || undefined,
          maxAttempts: cMax ? Number(cMax) : undefined
        }
      });
      toast.success('Campaign updated.');
      await refetch();
    } catch (err) {
      toast.error(
        (err as { message?: string })?.message ?? 'Could not save changes.'
      );
    } finally {
      setSaving(false);
    }
  };

  const transition = async (to: 'active' | 'paused') => {
    setSaving(true);
    try {
      await api.updateConfiguration(node.id, { transition: to });
      toast.success(to === 'active' ? 'Campaign started.' : 'Campaign paused.');
      await refetch();
    } catch (err) {
      toast.error(
        (err as { message?: string })?.message ?? 'Could not change status.'
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (enabled: boolean) => {
    try {
      await api.updateConfiguration(node.id, { enabled });
      toast.success(enabled ? 'Device enabled.' : 'Device disabled.');
      await refetch();
    } catch {
      toast.error('Could not update the device.');
    }
  };

  const regenerate = async () => {
    try {
      const res = await api.regenerateCredentials(node.id);
      setCredentials(node.id, res.credentials);
      onTabChange('credentials');
      toast.success('New credentials generated.');
    } catch {
      toast.error('Could not regenerate credentials.');
    }
  };

  const removeFromCanvas = async () => {
    try {
      await api.hide(node.id);
      toast.success('Removed from the canvas.');
      onClose();
      await refetch();
    } catch {
      toast.error('Could not remove that node.');
    }
  };

  const deleteEntity = async () => {
    try {
      await api.deleteResource(node.id);
      toast.success('Deleted.');
      onClose();
      await refetch();
    } catch (err) {
      toast.error(
        (err as { message?: string })?.message ?? 'Could not delete.'
      );
    }
  };

  // Contextual primary action (rendered in the sticky footer).
  const primary = (() => {
    if (!canMutate) return null;
    // When the node is incomplete, the primary action resolves what's missing.
    if (readiness?.incomplete && readiness.fixTab) {
      return {
        label: FIX_LABEL[readiness.state] ?? 'Finish setup',
        Icon: FIX_ICON[readiness.fixTab] ?? IconRoute,
        run: () => onTabChange(readiness.fixTab!)
      };
    }
    if (node.type === 'CAMPAIGN') {
      const s = node.status.toLowerCase();
      if (s === 'active')
        return {
          label: 'Pause campaign',
          Icon: IconPlayerPause,
          run: () => transition('paused')
        };
      return {
        label: 'Start campaign',
        Icon: IconPlayerPlay,
        run: () => transition('active')
      };
    }
    if (node.type === 'SIP_DEVICE')
      return {
        label: 'Show credentials',
        Icon: IconKey,
        run: () => onTabChange('credentials')
      };
    if (node.type === 'TEAM_MEMBER')
      return hasOrg
        ? {
            label: 'Assign to campaign',
            Icon: IconUsersGroup,
            run: () => onTabChange('campaigns')
          }
        : {
            label: 'Link SIP device',
            Icon: IconPlus,
            run: () => onTabChange('devices')
          };
    if (node.type === 'PHONE_NUMBER') {
      const s = node.status.toLowerCase();
      if (s === 'pending' || s.includes('document'))
        return {
          label: 'Submit documents',
          Icon: IconFileText,
          run: () => onTabChange('documents')
        };
      return {
        label: 'Configure routing',
        Icon: IconRoute,
        run: () => onTabChange('routing')
      };
    }
    return null;
  })();

  return (
    <aside
      role='dialog'
      aria-label={`${meta.label} inspector`}
      className={cn(
        'bg-card/95 absolute top-3 right-3 bottom-3 z-30 flex w-[384px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl ring-1 ring-white/5 backdrop-blur-xl',
        'transition-[transform,opacity] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        shown
          ? 'translate-x-0 scale-100 opacity-100'
          : 'pointer-events-none translate-x-3 scale-[0.985] opacity-0'
      )}
    >
      {/* Header — accent-tinted, editorial */}
      <div className='relative border-b p-4'>
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-20 [mask-image:linear-gradient(to_bottom,black,transparent)] opacity-[0.10]',
            meta.accent
          )}
        />
        <div className='relative flex items-start gap-3'>
          {isPerson ? (
            <Avatar className='size-11 shrink-0 rounded-xl'>
              {m.avatarUrl ? (
                <AvatarImage src={String(m.avatarUrl)} alt={title} />
              ) : null}
              <AvatarFallback
                className={cn('rounded-xl text-sm font-semibold', meta.badge)}
              >
                {nameInitials(node.name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-xl shadow-sm',
                meta.badge
              )}
            >
              <Icon className='size-5.5' />
            </div>
          )}
          <div className='min-w-0 flex-1 pt-0.5'>
            <p className='truncate text-[15px] leading-tight font-semibold'>
              {title}
            </p>
            <p className='text-muted-foreground mt-0.5 truncate text-xs'>
              {subtitle}
            </p>
            <div className='mt-1.5'>
              <StatusBadge status={node.status} />
            </div>
          </div>
          <div className='flex shrink-0 items-center gap-0.5'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size='icon'
                  variant='ghost'
                  className='text-muted-foreground hover:text-foreground size-8'
                  aria-label='Resource actions'
                >
                  <IconDotsVertical className='size-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-52'>
                <DropdownMenuItem asChild>
                  <Link href={dashboardHref(node)}>
                    <IconExternalLink className='size-4' />
                    Open in dashboard
                  </Link>
                </DropdownMenuItem>
                {canMutate ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={removeFromCanvas}>
                      <IconEyeOff className='size-4' />
                      Remove from canvas
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size='icon'
              variant='ghost'
              className='text-muted-foreground hover:text-foreground size-8'
              onClick={onClose}
              aria-label='Close inspector'
            >
              <IconX className='size-4' />
            </Button>
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => onTabChange(v as InspectorTab)}
        className='flex min-h-0 flex-1 flex-col'
      >
        <div className='relative shrink-0'>
          <TabsList className='mx-4 flex h-auto w-auto justify-start gap-0.5 overflow-x-auto rounded-none border-b bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
            {tabs.map((t) => (
              <TabsTrigger
                key={t}
                value={t}
                className='text-muted-foreground hover:text-foreground data-[state=active]:text-foreground relative shrink-0 rounded-none border-0 bg-transparent px-2.5 py-2.5 text-xs font-medium whitespace-nowrap data-[state=active]:bg-transparent data-[state=active]:shadow-none'
              >
                {TAB_LABEL[t]}
                {t === tab ? (
                  <motion.span
                    layoutId='infra-inspector-tab'
                    className='bg-foreground absolute inset-x-2 -bottom-px h-0.5 rounded-full'
                    transition={reduce ? { duration: 0 } : SPRING}
                  />
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* right-edge fade hints there are more tabs to scroll */}
          <span className='from-card pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l to-transparent' />
        </div>

        <div className='relative min-h-0 flex-1 overflow-hidden'>
          <motion.div
            key={tab}
            variants={reduce ? undefined : contentVariants}
            initial='hidden'
            animate='visible'
            className='h-full overflow-y-auto p-5'
          >
            {/* Overview */}
            <TabsContent value='overview' className='mt-0 space-y-4'>
              {readiness ? (
                <ReadinessBanner
                  readiness={readiness}
                  canMutate={canMutate}
                  onFix={onTabChange}
                />
              ) : null}
              {requirements.length > 0 ? (
                <RequirementList items={requirements} />
              ) : null}
              {connRows.length > 0 ? (
                <div>
                  <p className='text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wide uppercase'>
                    Current setup
                  </p>
                  <FieldCard>
                    {connRows.map((r) => (
                      <Field
                        key={`${r.label}-${r.value}`}
                        label={r.label}
                        value={r.value}
                      />
                    ))}
                  </FieldCard>
                </div>
              ) : null}
              <FieldCard>
                <Field label='Name' value={node.name} />
                {isOwner ? <Field label='Owner' value='You' /> : null}
                {!isOwner && 'role' in m ? (
                  <Field label='Role' value={String(m.role)} />
                ) : null}
                {'email' in m && m.email ? (
                  <Field label='Email' value={String(m.email)} />
                ) : null}
                {'country' in m && m.country ? (
                  <Field label='Country' value={String(m.country)} />
                ) : null}
                {'numberType' in m && m.numberType ? (
                  <Field label='Type' value={String(m.numberType)} />
                ) : null}
                {node.type === 'SIP_DEVICE' && !hasOrg ? (
                  <Field label='Owner' value='You' />
                ) : null}
                {'assignedNumber' in m ? (
                  <Field
                    label='Assigned number'
                    value={m.assignedNumber ? String(m.assignedNumber) : '—'}
                  />
                ) : null}
                {'assignedCampaign' in m && m.assignedCampaign ? (
                  <Field label='Campaign' value={String(m.assignedCampaign)} />
                ) : null}
                {'leads' in m ? (
                  <Field label='Leads' value={Number(m.leads ?? 0)} />
                ) : null}
                {'members' in m ? (
                  <Field
                    label='Numbers in pool'
                    value={Number(m.members ?? 0)}
                  />
                ) : null}
                {'monthlyCost' in m && m.monthlyCost ? (
                  <Field
                    label='Monthly price'
                    value={`$${Number(m.monthlyCost).toFixed(2)}`}
                  />
                ) : null}
                {'provider' in m && m.provider ? (
                  <Field label='Provider' value={String(m.provider)} />
                ) : null}
                <Field label='Status' value={node.status} />
              </FieldCard>
              <Button asChild variant='outline' className='w-full gap-1.5'>
                <Link href={dashboardHref(node)}>
                  <IconExternalLink className='size-4' />
                  Open in dashboard
                </Link>
              </Button>
            </TabsContent>

            {/* Configuration */}
            <TabsContent value='configuration' className='mt-0 space-y-4'>
              <div className='space-y-1'>
                <Label>Display label</Label>
                <div className='flex gap-2'>
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    disabled={!canMutate}
                  />
                  <Button
                    size='sm'
                    onClick={saveLabel}
                    disabled={
                      saving ||
                      !canMutate ||
                      !label.trim() ||
                      label === node.name
                    }
                  >
                    Save
                  </Button>
                </div>
              </div>

              {node.type === 'CAMPAIGN' ? (
                <div className='space-y-3 border-t pt-3'>
                  <div className='space-y-1'>
                    <Label>Campaign name</Label>
                    <Input
                      value={cName}
                      onChange={(e) => setCName(e.target.value)}
                      disabled={!canMutate}
                    />
                  </div>
                  <div className='space-y-1'>
                    <Label>Max attempts</Label>
                    <Input
                      type='number'
                      value={cMax}
                      onChange={(e) => setCMax(e.target.value)}
                      disabled={!canMutate}
                    />
                  </div>
                  <Button
                    size='sm'
                    onClick={saveCampaign}
                    disabled={saving || !canMutate}
                  >
                    Save configuration
                  </Button>
                  <p className='text-muted-foreground text-xs'>
                    Script, outcomes and calling rules live in the campaign
                    dashboard.
                  </p>
                </div>
              ) : null}

              {node.type === 'SIP_DEVICE' ? (
                <div className='flex items-center justify-between border-t pt-3'>
                  <div>
                    <p className='text-sm font-medium'>Device enabled</p>
                    <p className='text-muted-foreground text-xs'>
                      Disable to block calls without deleting the device.
                    </p>
                  </div>
                  <Switch
                    disabled={!canMutate}
                    checked={node.status.toLowerCase() !== 'disabled'}
                    onCheckedChange={toggleEnabled}
                  />
                </div>
              ) : null}
            </TabsContent>

            {/* Routing (phone number) */}
            <TabsContent value='routing' className='mt-0 space-y-5'>
              {hasOrg ? (
                <Section title='Use in campaign'>
                  <AssignSection
                    node={node}
                    targetType='CAMPAIGN'
                    nodes={nodes}
                    edges={edges}
                    entities={entities}
                    canMutate={canMutate}
                    onChanged={refetch}
                  />
                </Section>
              ) : null}
              <Section title='Route to SIP device'>
                <AssignSection
                  node={node}
                  targetType='SIP_DEVICE'
                  nodes={nodes}
                  edges={edges}
                  entities={entities}
                  canMutate={canMutate}
                  onChanged={refetch}
                />
              </Section>
              <Section title={hasOrg ? 'Route to team member' : 'Route to me'}>
                <AssignSection
                  node={node}
                  targetType='TEAM_MEMBER'
                  nodes={nodes}
                  edges={edges}
                  entities={entities}
                  canMutate={canMutate}
                  onChanged={refetch}
                />
              </Section>
            </TabsContent>

            {/* Agents (campaign) — organization only */}
            <TabsContent value='agents' className='mt-0'>
              <AssignSection
                node={node}
                targetType='TEAM_MEMBER'
                nodes={nodes}
                edges={edges}
                entities={entities}
                canMutate={canMutate}
                onChanged={refetch}
              />
            </TabsContent>

            {/* Numbers (campaign) */}
            <TabsContent value='numbers' className='mt-0'>
              <AssignSection
                node={node}
                targetType='PHONE_NUMBER'
                nodes={nodes}
                edges={edges}
                entities={entities}
                canMutate={canMutate}
                onChanged={refetch}
              />
            </TabsContent>

            {/* Leads (campaign) */}
            <TabsContent value='leads' className='mt-0 space-y-3'>
              <p className='text-muted-foreground text-sm'>
                {Number(m.leads ?? 0)} lead
                {Number(m.leads ?? 0) === 1 ? '' : 's'} in this campaign.
              </p>
              <Button asChild variant='outline' className='w-full'>
                <Link href={dashboardHref(node)}>
                  <IconExternalLink className='size-4' />
                  Manage leads
                </Link>
              </Button>
            </TabsContent>

            {/* Campaigns (team member) — organization only */}
            <TabsContent value='campaigns' className='mt-0'>
              <AssignSection
                node={node}
                targetType='CAMPAIGN'
                nodes={nodes}
                edges={edges}
                entities={entities}
                canMutate={canMutate}
                onChanged={refetch}
              />
            </TabsContent>

            {/* Devices (team member) */}
            <TabsContent value='devices' className='mt-0 space-y-3'>
              <AssignSection
                node={node}
                targetType='SIP_DEVICE'
                nodes={nodes}
                edges={edges}
                entities={entities}
                canMutate={canMutate}
                onChanged={refetch}
              />
              {canMutate ? (
                <Button
                  variant='outline'
                  className='w-full'
                  onClick={() => onOpenCreate('SIP_DEVICE')}
                >
                  <IconPlus className='size-4' />
                  Create SIP device
                </Button>
              ) : null}
            </TabsContent>

            {/* Credentials (SIP) */}
            <TabsContent value='credentials' className='mt-0 space-y-3'>
              {credentials ? (
                <>
                  <CopyRow label='SIP username' value={credentials.username} />
                  <CopyRow label='SIP server' value={credentials.sipServer} />
                  <CopyRow label='Password' value={credentials.password} />
                  <p className='text-muted-foreground text-xs'>
                    The password is shown once. Store it now — regenerate to get
                    a new one.
                  </p>
                </>
              ) : (
                <>
                  {'sipUsername' in m && m.sipUsername ? (
                    <CopyRow
                      label='SIP username'
                      value={String(m.sipUsername)}
                    />
                  ) : null}
                  <p className='text-muted-foreground text-sm'>
                    The password is only shown at creation. Regenerate to get a
                    new password you can copy.
                  </p>
                </>
              )}
              {canMutate ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant='outline' className='w-full'>
                      <IconRefresh className='size-4' />
                      Regenerate password
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Regenerate password?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The device will need reconfiguring with the new
                        password. Any phone still using the old password will
                        stop registering.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={regenerate}>
                        Regenerate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </TabsContent>

            {/* Registration (SIP) */}
            <TabsContent value='registration' className='mt-0 space-y-2'>
              <Field
                label='Last registration'
                value={
                  m.lastRegisteredAt
                    ? new Date(String(m.lastRegisteredAt)).toLocaleString()
                    : 'Never'
                }
              />
              <Field label='Status' value={node.status} />
              <p className='text-muted-foreground text-xs'>
                If the device never registers: check the SIP server, that the
                username/password match, and that the network allows TLS on the
                SIP port.
              </p>
            </TabsContent>

            {/* Documents (phone) */}
            <TabsContent value='documents' className='mt-0 space-y-3'>
              {loadingDocs ? (
                <p className='text-muted-foreground text-sm'>Loading…</p>
              ) : !docs || docs.requirements.length === 0 ? (
                <p className='text-muted-foreground text-sm'>
                  No documents required for this number.
                </p>
              ) : (
                <>
                  <Field
                    label='Verification'
                    value={docs.requirementsMet ? 'Complete' : 'Pending'}
                  />
                  <ul className='space-y-2'>
                    {docs.requirements.map((r) => (
                      <li key={r.id} className='rounded-md border p-2'>
                        <p className='text-sm font-medium'>{r.name}</p>
                        {r.description ? (
                          <p className='text-muted-foreground text-xs'>
                            {r.description}
                          </p>
                        ) : null}
                        <p className='text-muted-foreground mt-1 text-xs'>
                          Status: {r.status ?? 'pending'}
                          {r.reason ? ` — ${r.reason}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {/* Document verification is not yet ported into Infra — temporary
                    fallback into the existing dashboard flow. */}
                  <Button asChild className='w-full'>
                    <Link href='/dashboard/buy-number?tab=my-numbers'>
                      <IconExternalLink className='size-4' />
                      Complete verification
                    </Link>
                  </Button>
                </>
              )}
            </TabsContent>

            {/* Billing (phone) */}
            <TabsContent value='billing' className='mt-0 space-y-3'>
              <Field
                label='Monthly price'
                value={
                  m.monthlyCost
                    ? `$${Number(m.monthlyCost).toFixed(2)} ${String(m.currency ?? 'USD')}`
                    : '—'
                }
              />
              <Field label='Subscription' value='Active (Stripe)' />
              <div className='border-destructive/40 rounded-lg border p-3'>
                <p className='text-sm font-medium'>Release this number</p>
                <p className='text-muted-foreground text-xs'>
                  Cancels the subscription and removes the number from your
                  workspace. This can&apos;t be undone.
                </p>
                {canMutate ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size='sm' variant='destructive' className='mt-2'>
                        Release number
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Release {node.name}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Releasing cancels billing and frees the number. Manage
                          the release from the numbers dashboard.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            window.location.href =
                              '/dashboard/buy-number?tab=my-numbers';
                          }}
                        >
                          Continue
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </div>
            </TabsContent>

            {/* Usage */}
            <TabsContent value='usage' className='mt-0'>
              <div className='grid grid-cols-2 gap-3'>
                {node.type === 'CAMPAIGN' ? (
                  <Metric label='Leads' value={Number(m.leads ?? 0)} />
                ) : null}
                {node.type === 'TEAM_MEMBER' ? (
                  <>
                    <Metric
                      label='Campaigns'
                      value={Number(m.assignedCampaigns ?? 0)}
                    />
                    <Metric
                      label='SIP devices'
                      value={Number(m.assignedSipDevices ?? 0)}
                    />
                  </>
                ) : null}
                {node.type === 'NUMBER_POOL' ? (
                  <Metric label='Numbers' value={Number(m.members ?? 0)} />
                ) : null}
                <Metric label='Calls today' value='—' />
                <Metric label='Calls this month' value='—' />
              </div>
              <p className='text-muted-foreground mt-3 text-xs'>
                Detailed call metrics are coming soon.
              </p>
            </TabsContent>

            {/* Logs */}
            <TabsContent value='logs' className='mt-0'>
              {loadingEvents ? (
                <p className='text-muted-foreground text-sm'>Loading…</p>
              ) : events.length === 0 ? (
                <MiniEmpty>No activity yet.</MiniEmpty>
              ) : (
                <ul className='space-y-2'>
                  {events.map((e) => (
                    <li key={e.id} className='border-b pb-2 last:border-0'>
                      <p className='text-sm'>{e.message}</p>
                      <p className='text-muted-foreground text-xs'>
                        {new Date(e.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            {/* Settings */}
            <TabsContent value='settings' className='mt-0 space-y-4'>
              <Button asChild variant='outline' className='w-full'>
                <Link href={dashboardHref(node)}>Manage in dashboard</Link>
              </Button>

              <div className='rounded-lg border p-3'>
                <p className='text-sm font-medium'>Remove from canvas</p>
                <p className='text-muted-foreground text-xs'>
                  Hides this node. The real resource is not deleted.
                </p>
                <Button
                  size='sm'
                  variant='outline'
                  className='mt-2'
                  disabled={!canMutate}
                  onClick={removeFromCanvas}
                >
                  Remove from canvas
                </Button>
              </div>

              {(node.type === 'SIP_DEVICE' || node.type === 'CAMPAIGN') &&
              canMutate ? (
                <div className='border-destructive/40 rounded-lg border p-3'>
                  <p className='text-sm font-medium'>
                    Delete {node.type === 'SIP_DEVICE' ? 'device' : 'campaign'}
                  </p>
                  <p className='text-muted-foreground text-xs'>
                    Permanently deletes the real resource. This can&apos;t be
                    undone.
                  </p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size='sm' variant='destructive' className='mt-2'>
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {node.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently deletes the{' '}
                          {node.type === 'SIP_DEVICE' ? 'device' : 'campaign'}{' '}
                          and everything attached to it.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={deleteEntity}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : null}
            </TabsContent>
          </motion.div>
        </div>
      </Tabs>

      {/* Sticky footer — the resource's primary action */}
      {primary ? (
        <div className='bg-card/70 border-t p-3 backdrop-blur-md'>
          <Button
            className='w-full gap-1.5 shadow-sm shadow-emerald-500/15 transition-shadow hover:shadow-md hover:shadow-emerald-500/20'
            onClick={primary.run}
          >
            <primary.Icon className='size-4' />
            {primary.label}
          </Button>
        </div>
      ) : null}
    </aside>
  );
}

function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{title}</p>
      {children}
    </div>
  );
}
