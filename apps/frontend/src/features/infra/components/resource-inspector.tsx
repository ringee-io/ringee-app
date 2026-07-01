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
  IconRefresh
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { useInfraApi } from '../api';
import { useInfraStore } from '../store/infra.store';
import { useEntities } from '../lib/use-entities';
import {
  RESOURCE_META,
  TONE_DOT,
  TAB_LABEL,
  dashboardHref,
  getInspectorTabs,
  statusTone,
  type InspectorTab
} from '../lib/node-config';
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-3 border-b py-2 last:border-0'>
      <span className='text-muted-foreground text-sm'>{label}</span>
      <span className='truncate text-right text-sm font-medium'>
        {value ?? '—'}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='bg-muted/40 rounded-lg border p-3'>
      <p className='text-2xl font-semibold tabular-nums'>{value}</p>
      <p className='text-muted-foreground text-xs'>{label}</p>
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
        <p className='text-muted-foreground text-sm'>
          No {meta.label.toLowerCase()} connected yet.
        </p>
      ) : (
        <ul className='space-y-1'>
          {connected.map((c) => (
            <li
              key={c.id}
              className='flex items-center justify-between gap-2 rounded-md border p-2'
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
  const { credentialsByResource, setCredentials } = useInfraStore();
  const { entities } = useEntities(!!selectedNode);

  // Keep the last node mounted through the close transition.
  const [view, setView] = useState<InfraNode | null>(selectedNode);
  const [shown, setShown] = useState(false);

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
  const tone = statusTone(node.status);
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
    if (node.type === 'CAMPAIGN') {
      const s = node.status.toLowerCase();
      if (s === 'active')
        return { label: 'Pause campaign', run: () => transition('paused') };
      return { label: 'Start campaign', run: () => transition('active') };
    }
    if (node.type === 'SIP_DEVICE')
      return {
        label: 'Show credentials',
        run: () => onTabChange('credentials')
      };
    if (node.type === 'TEAM_MEMBER')
      return hasOrg
        ? { label: 'Assign to campaign', run: () => onTabChange('campaigns') }
        : { label: 'Link SIP device', run: () => onTabChange('devices') };
    if (node.type === 'PHONE_NUMBER') {
      const s = node.status.toLowerCase();
      if (s === 'pending' || s.includes('document'))
        return {
          label: 'Submit documents',
          run: () => onTabChange('documents')
        };
      return { label: 'Configure routing', run: () => onTabChange('routing') };
    }
    return null;
  })();

  return (
    <aside
      role='dialog'
      aria-label={`${meta.label} inspector`}
      className={cn(
        'bg-card/95 absolute top-3 right-3 bottom-3 z-30 flex w-[372px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-200 ease-out',
        shown
          ? 'translate-x-0 opacity-100'
          : 'pointer-events-none translate-x-4 opacity-0'
      )}
    >
      {/* Header */}
      <div className='flex items-start gap-3 border-b p-4'>
        {isPerson ? (
          <Avatar className='size-10 shrink-0 rounded-lg'>
            {m.avatarUrl ? (
              <AvatarImage src={String(m.avatarUrl)} alt={title} />
            ) : null}
            <AvatarFallback
              className={cn('rounded-lg text-sm font-semibold', meta.badge)}
            >
              {nameInitials(node.name)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-lg',
              meta.badge
            )}
          >
            <Icon className='size-5' />
          </div>
        )}
        <div className='min-w-0 flex-1'>
          <p className='truncate font-semibold'>{title}</p>
          <p className='text-muted-foreground flex items-center gap-2 text-sm'>
            {subtitle}
            <span className='inline-flex items-center gap-1'>
              <span className={cn('size-2 rounded-full', TONE_DOT[tone])} />
              {node.status}
            </span>
          </p>
        </div>
        <Button
          size='icon'
          variant='ghost'
          className='text-muted-foreground hover:text-foreground -mt-1 -mr-1 size-8 shrink-0'
          onClick={onClose}
          aria-label='Close inspector'
        >
          <IconX className='size-4' />
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => onTabChange(v as InspectorTab)}
        className='flex min-h-0 flex-1 flex-col'
      >
        <TabsList className='mx-4 mt-3 flex w-auto justify-start gap-1 overflow-x-auto bg-transparent p-0'>
          {tabs.map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              className='data-[state=active]:bg-muted rounded-md px-2.5 py-1 text-xs'
            >
              {TAB_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className='min-h-0 flex-1 overflow-y-auto p-4'>
          {/* Overview */}
          <TabsContent value='overview' className='mt-0'>
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
              <Field label='Numbers in pool' value={Number(m.members ?? 0)} />
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
            <Button asChild size='sm' variant='outline' className='mt-3 w-full'>
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
                    saving || !canMutate || !label.trim() || label === node.name
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
              {Number(m.leads ?? 0)} lead{Number(m.leads ?? 0) === 1 ? '' : 's'}{' '}
              in this campaign.
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
                  The password is shown once. Store it now — regenerate to get a
                  new one.
                </p>
              </>
            ) : (
              <>
                {'sipUsername' in m && m.sipUsername ? (
                  <CopyRow label='SIP username' value={String(m.sipUsername)} />
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
                      The device will need reconfiguring with the new password.
                      Any phone still using the old password will stop
                      registering.
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
                      <AlertDialogTitle>Release {node.name}?</AlertDialogTitle>
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
              <p className='text-muted-foreground text-sm'>No activity yet.</p>
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
                        {node.type === 'SIP_DEVICE' ? 'device' : 'campaign'} and
                        everything attached to it.
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
        </div>
      </Tabs>

      {/* Sticky footer — primary action */}
      {primary ? (
        <div className='bg-card/80 border-t p-3 backdrop-blur'>
          <Button size='sm' className='w-full' onClick={primary.run}>
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
