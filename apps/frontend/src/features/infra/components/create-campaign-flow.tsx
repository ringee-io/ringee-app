'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { toast } from 'sonner';
import { useInfraApi } from '../api';
import { useEntities } from '../lib/use-entities';
import type { OnResourceCreated } from '../lib/node-config';

const DIALER_MODES = [
  { value: 'preview', label: 'Preview (manual)' },
  { value: 'progressive', label: 'Progressive (power)' }
];

const NO_NUMBER = '__none__';

/** "Add campaign" — creates a draft campaign (org only) and opens its inspector. */
export function CreateCampaignFlow({
  open,
  position,
  hasOrg,
  onClose,
  onCreated
}: {
  open: boolean;
  position: { x: number; y: number } | null;
  hasOrg: boolean;
  onClose: () => void;
  onCreated: OnResourceCreated;
}) {
  const api = useInfraApi();
  const { byType } = useEntities(open);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dialerMode, setDialerMode] = useState('preview');
  const [numberPurchasedId, setNumberPurchasedId] = useState(NO_NUMBER);
  const [agentIds, setAgentIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const numbers = byType('PHONE_NUMBER');
  const members = byType('TEAM_MEMBER');

  const toggleAgent = (id: string) =>
    setAgentIds((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const reset = () => {
    setName('');
    setDescription('');
    setDialerMode('preview');
    setNumberPurchasedId(NO_NUMBER);
    setAgentIds(new Set());
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await api.createCampaign({
        name: name.trim(),
        description: description.trim() || undefined,
        dialerMode,
        numberPurchasedId:
          numberPurchasedId === NO_NUMBER ? undefined : numberPurchasedId,
        agentUserIds: agentIds.size > 0 ? Array.from(agentIds) : undefined,
        position: position ?? undefined
      });
      toast.success('Campaign created as a draft.');
      onCreated(res.resourceId, { tab: 'configuration' });
      reset();
      onClose();
    } catch (err) {
      toast.error(
        (err as { message?: string })?.message ??
          'Could not create the campaign.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Add campaign</DialogTitle>
          <DialogDescription>
            Create a draft campaign. Agents, leads and numbers are configured in
            the inspector.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-3'>
          <div className='space-y-1'>
            <Label>Campaign name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Q3 outbound'
              autoFocus
            />
          </div>

          <div className='space-y-1'>
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label>Dialing mode</Label>
              <Select value={dialerMode} onValueChange={setDialerMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIALER_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-1'>
              <Label>Phone number (optional)</Label>
              <Select
                value={numberPurchasedId}
                onValueChange={setNumberPurchasedId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_NUMBER}>None</SelectItem>
                  {numbers.map((n) => (
                    <SelectItem key={n.referenceId} value={n.referenceId}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Agents — organization only; assign team members up front. */}
          {hasOrg && members.length > 0 ? (
            <div className='space-y-1.5'>
              <Label>Agents (optional)</Label>
              <div className='max-h-36 space-y-1 overflow-y-auto rounded-md border p-1'>
                {members.map((mem) => {
                  const checked = agentIds.has(mem.referenceId);
                  return (
                    <button
                      key={mem.referenceId}
                      type='button'
                      onClick={() => toggleAgent(mem.referenceId)}
                      className={cn(
                        'hover:bg-accent flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left',
                        checked && 'bg-accent'
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        className='pointer-events-none'
                      />
                      <span className='truncate text-sm'>{mem.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className='w-full'
          >
            {saving ? 'Creating…' : 'Create campaign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
