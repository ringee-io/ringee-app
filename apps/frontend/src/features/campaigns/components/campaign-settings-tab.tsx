'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
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
import { Loader2, Phone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Campaign, DialerMode } from '../types/campaign.types';

interface CallerId {
  id: string;
  phoneNumber: string;
  verified: boolean;
  active?: boolean;
  status: string;
}

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  status: string | null;
}

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney'
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

interface Props {
  campaign: Campaign;
  onUpdated: () => void;
}

export function CampaignSettingsTab({ campaign, onUpdated }: Props) {
  const api = useApi();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callerIds, setCallerIds] = useState<CallerId[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);

  const [form, setForm] = useState({
    name: campaign.name,
    description: campaign.description || '',
    dialerMode: campaign.dialerMode,
    callerIdId: campaign.callerIdId || '',
    numberPurchasedId: campaign.numberPurchasedId || '',
    maxAttempts: campaign.maxAttempts,
    timezone: campaign.timezone,
    workStartMin: campaign.workStartMin,
    workEndMin: campaign.workEndMin,
    workDays: campaign.workDays,
    wrapUpTimeSec: campaign.wrapUpTimeSec,
    retryDelayMin: campaign.retryDelayMin
  });

  useEffect(() => {
    api
      .get<CallerId[]>('/telephony/caller-ids')
      .then(setCallerIds)
      .catch(() => {});
    api
      .get<PhoneNumber[]>('/telephony/phone-numbers')
      .then(setPhoneNumbers)
      .catch(() => {});
  }, [api]);

  function updateForm(patch: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function toggleDay(day: number) {
    updateForm({
      workDays: form.workDays.includes(day)
        ? form.workDays.filter((d) => d !== day)
        : [...form.workDays, day].sort()
    });
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/campaigns/${campaign.id}`, {
        ...form,
        // Empty values clear the FK rather than violating it.
        callerIdId: form.callerIdId || null,
        numberPurchasedId: form.numberPurchasedId || null
      });
      onUpdated();
      toast.success('Settings saved.');
    } catch (err: any) {
      const message = err?.message || 'Failed to save settings';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/campaigns/${campaign.id}`);
      toast.success('Campaign deleted.');
      router.push('/dashboard/campaigns');
    } catch (err: any) {
      const message = err?.message || 'Failed to delete campaign';
      setError(message);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }

  const isDraft = campaign.status === 'draft';

  return (
    <div className='space-y-6'>
      {error && (
        <div className='bg-destructive/10 text-destructive rounded-md px-4 py-3 text-sm'>
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='settings-name'>Campaign Name</Label>
            <Input
              id='settings-name'
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='settings-desc'>Description</Label>
            <Textarea
              id='settings-desc'
              value={form.description}
              onChange={(e) => updateForm({ description: e.target.value })}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dialer</CardTitle>
          <CardDescription>
            {!isDraft &&
              'Some settings cannot be changed while the campaign is active.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label>Phone Number</Label>
            <Select
              value={form.numberPurchasedId || ''}
              onValueChange={(v) => updateForm({ numberPurchasedId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select a phone number...' />
              </SelectTrigger>
              <SelectContent>
                {phoneNumbers.map((num) => (
                  <SelectItem key={num.id} value={num.id}>
                    <span className='flex items-center gap-2'>
                      <Phone className='h-3 w-3' />
                      {num.phoneNumber}
                    </span>
                  </SelectItem>
                ))}
                {phoneNumbers.length === 0 && (
                  <SelectItem value='__none' disabled>
                    No purchased numbers
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className='text-muted-foreground text-xs'>
              Calls in this campaign are placed from this purchased number.
            </p>
          </div>

          <div className='space-y-2'>
            <Label>Caller ID (optional)</Label>
            <Select
              value={form.callerIdId || '__default'}
              onValueChange={(v) =>
                updateForm({ callerIdId: v === '__default' ? '' : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='Use the campaign phone number' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='__default'>
                  Use the campaign phone number (default)
                </SelectItem>
                {callerIds
                  .filter((c) => c.verified && c.active !== false)
                  .map((cid) => (
                    <SelectItem key={cid.id} value={cid.id}>
                      <span className='flex items-center gap-2'>
                        <Phone className='h-3 w-3' />
                        {cid.phoneNumber}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className='text-muted-foreground text-xs'>
              Legacy verified caller ID, used only when no phone number is
              assigned above.
            </p>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label>Dialer Mode</Label>
              <Select
                value={form.dialerMode}
                onValueChange={(v) =>
                  updateForm({ dialerMode: v as DialerMode })
                }
                disabled={!isDraft}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='progressive'>Progressive</SelectItem>
                  <SelectItem value='preview'>Preview</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='s-attempts'>Max Attempts</Label>
              <Input
                id='s-attempts'
                type='number'
                min={1}
                max={20}
                value={form.maxAttempts}
                onChange={(e) =>
                  updateForm({ maxAttempts: Number(e.target.value) })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='s-wrap'>Wrap-up Time (sec)</Label>
              <Input
                id='s-wrap'
                type='number'
                min={0}
                max={300}
                value={form.wrapUpTimeSec}
                onChange={(e) =>
                  updateForm({ wrapUpTimeSec: Number(e.target.value) })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='s-retry'>Default Retry Delay (min)</Label>
              <Input
                id='s-retry'
                type='number'
                min={1}
                max={10080}
                value={form.retryDelayMin}
                onChange={(e) =>
                  updateForm({ retryDelayMin: Number(e.target.value) })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calling Schedule</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label>Timezone</Label>
            <Select
              value={form.timezone}
              onValueChange={(v) => updateForm({ timezone: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label>Start Time</Label>
              <Input
                type='time'
                value={minutesToTime(form.workStartMin)}
                onChange={(e) =>
                  updateForm({ workStartMin: timeToMinutes(e.target.value) })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label>End Time</Label>
              <Input
                type='time'
                value={minutesToTime(form.workEndMin)}
                onChange={(e) =>
                  updateForm({ workEndMin: timeToMinutes(e.target.value) })
                }
              />
            </div>
          </div>
          <div className='space-y-2'>
            <Label>Working Days</Label>
            <div className='flex flex-wrap gap-2'>
              {DAY_LABELS.map((label, idx) => (
                <Button
                  key={idx}
                  type='button'
                  variant={form.workDays.includes(idx) ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => toggleDay(idx)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className='flex items-center justify-between'>
        {isDraft ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant='destructive' size='sm'>
                <Trash2 className='mr-2 h-4 w-4' />
                Delete Campaign
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Campaign?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &ldquo;{campaign.name}&rdquo; and
                  all associated data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                >
                  {deleting && (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  )}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <div />
        )}

        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
