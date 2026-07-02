'use client';

import { useState } from 'react';
import { InfraDialog } from './infra-dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { toast } from 'sonner';
import { useInfraApi } from '../api';
import { useEntities } from '../lib/use-entities';
import type { OnResourceCreated } from '../lib/node-config';

const DEVICE_TYPES = [
  { value: 'desk_phone', label: 'Desk phone' },
  { value: 'softphone', label: 'Softphone' },
  { value: 'webrtc', label: 'WebRTC' },
  { value: 'other', label: 'Other' }
];

const SELF = '__self__';
const NO_NUMBER = '__none__';

/** "Add SIP device" — short modal, then credentials in the inspector. */
export function CreateSipDeviceFlow({
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
  const [label, setLabel] = useState('');
  const [deviceType, setDeviceType] = useState('desk_phone');
  const [assignedUserId, setAssignedUserId] = useState(SELF);
  const [numberId, setNumberId] = useState(NO_NUMBER);
  const [allowInbound, setAllowInbound] = useState(true);
  const [saving, setSaving] = useState(false);

  const members = byType('TEAM_MEMBER');
  const numbers = byType('PHONE_NUMBER');

  const reset = () => {
    setLabel('');
    setDeviceType('desk_phone');
    setAssignedUserId(SELF);
    setNumberId(NO_NUMBER);
    setAllowInbound(true);
  };

  const handleCreate = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const res = await api.createSipDevice({
        label: label.trim(),
        deviceType,
        assignedUserId: assignedUserId === SELF ? undefined : assignedUserId,
        numberId: numberId === NO_NUMBER ? undefined : numberId,
        allowInbound,
        position: position ?? undefined
      });
      toast.success('SIP device created.');
      onCreated(res.resourceId, {
        credentials: res.credentials,
        tab: 'credentials'
      });
      reset();
      onClose();
    } catch (err) {
      toast.error(
        (err as { message?: string })?.message ?? 'Could not create the device.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <InfraDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
      type='SIP_DEVICE'
      title='Add SIP device'
      description='Create a device. Credentials appear in the inspector after creation.'
      footer={
        <Button
          onClick={handleCreate}
          disabled={saving || !label.trim()}
          className='w-full'
        >
          {saving ? 'Creating…' : 'Create device'}
        </Button>
      }
    >
      <div className='space-y-4'>
        <div className='space-y-1'>
          <Label>Device name</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='Front desk phone'
            autoFocus
          />
        </div>

        <div className={hasOrg ? 'grid grid-cols-2 gap-3' : 'space-y-1'}>
          <div className='space-y-1'>
            <Label>Type</Label>
            <Select value={deviceType} onValueChange={setDeviceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEVICE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* "Assign to" is a team concept — only in an organization. In the
                personal workspace the device is always owned by the user. */}
          {hasOrg ? (
            <div className='space-y-1'>
              <Label>Assign to</Label>
              <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELF}>Me</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.referenceId} value={m.referenceId}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <div className='space-y-1'>
          <Label>Linked phone number (optional)</Label>
          <Select value={numberId} onValueChange={setNumberId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_NUMBER}>No number</SelectItem>
              {numbers.map((n) => (
                <SelectItem key={n.referenceId} value={n.referenceId}>
                  {n.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='bg-muted/30 flex items-center justify-between rounded-xl border p-3'>
          <div>
            <p className='text-sm font-medium'>Receive inbound calls</p>
            <p className='text-muted-foreground text-xs'>
              Route the linked number&apos;s inbound calls to this device.
            </p>
          </div>
          <Switch checked={allowInbound} onCheckedChange={setAllowInbound} />
        </div>
      </div>
    </InfraDialog>
  );
}
