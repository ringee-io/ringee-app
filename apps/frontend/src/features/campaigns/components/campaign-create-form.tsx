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
import { Loader2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import type {
  Campaign,
  CreateCampaignDto,
  DialerMode
} from '../types/campaign.types';

interface CallerId {
  id: string;
  phoneNumber: string;
  verified: boolean;
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

export function CampaignCreateForm() {
  const api = useApi();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callerIds, setCallerIds] = useState<CallerId[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);

  const [form, setForm] = useState<CreateCampaignDto>({
    name: '',
    description: '',
    dialerMode: 'progressive',
    maxAttempts: 3,
    timezone: 'America/New_York',
    workStartMin: 480,
    workEndMin: 1260,
    workDays: [0, 1, 2, 3, 4, 5, 6],
    wrapUpTimeSec: 30,
    retryDelayMin: 60
  });

  // Load caller IDs and purchased numbers on mount
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

  function updateForm(patch: Partial<CreateCampaignDto>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function toggleDay(day: number) {
    const days = form.workDays ?? [1, 2, 3, 4, 5];
    updateForm({
      workDays: days.includes(day)
        ? days.filter((d) => d !== day)
        : [...days, day].sort()
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Campaign name is required');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const campaign = await api.post<Campaign>('/campaigns', form);
      toast.success('Campaign created.');
      router.push(`/dashboard/campaigns/${campaign.id}`);
    } catch (err: any) {
      const message = err?.message || 'Failed to create campaign';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-6'>
      {error && (
        <div className='bg-destructive/10 text-destructive rounded-md px-4 py-3 text-sm'>
          {error}
        </div>
      )}

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
          <CardDescription>
            Name and describe your outbound campaign.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='name'>Campaign Name *</Label>
            <Input
              id='name'
              placeholder='e.g. Q2 Outreach'
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='description'>Description</Label>
            <Textarea
              id='description'
              placeholder='Brief description of this campaign...'
              value={form.description || ''}
              onChange={(e) => updateForm({ description: e.target.value })}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Dialer Config */}
      <Card>
        <CardHeader>
          <CardTitle>Dialer Settings</CardTitle>
          <CardDescription>Configure how calls are placed.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label>Phone Number</Label>
            <Select
              value={form.numberPurchasedId || ''}
              onValueChange={(v) =>
                updateForm({ numberPurchasedId: v || undefined })
              }
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
                updateForm({ callerIdId: v === '__default' ? undefined : v })
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
                  .filter((c) => c.verified)
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
              assigned above. Leave as default to use the campaign phone number.
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
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='progressive'>
                    Progressive — auto-dials next lead
                  </SelectItem>
                  <SelectItem value='preview'>
                    Preview — agent reviews before dialing
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='maxAttempts'>Max Attempts per Lead</Label>
              <Input
                id='maxAttempts'
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
              <Label htmlFor='wrapUp'>Wrap-up Time (seconds)</Label>
              <Input
                id='wrapUp'
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
              <Label htmlFor='retryDelay'>Default Retry Delay (minutes)</Label>
              <Input
                id='retryDelay'
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

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Calling Schedule</CardTitle>
          <CardDescription>Set when agents can make calls.</CardDescription>
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
              <Label htmlFor='workStart'>Start Time</Label>
              <Input
                id='workStart'
                type='time'
                value={minutesToTime(form.workStartMin ?? 480)}
                onChange={(e) =>
                  updateForm({ workStartMin: timeToMinutes(e.target.value) })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='workEnd'>End Time</Label>
              <Input
                id='workEnd'
                type='time'
                value={minutesToTime(form.workEndMin ?? 1260)}
                onChange={(e) =>
                  updateForm({ workEndMin: timeToMinutes(e.target.value) })
                }
              />
            </div>
          </div>
          <div className='space-y-2'>
            <Label>Working Days</Label>
            <div className='flex flex-wrap gap-2'>
              {DAY_LABELS.map((label, idx) => {
                const selected = (form.workDays ?? []).includes(idx);
                return (
                  <Button
                    key={idx}
                    type='button'
                    variant={selected ? 'default' : 'outline'}
                    size='sm'
                    onClick={() => toggleDay(idx)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className='flex items-center justify-end gap-3'>
        <Button
          type='button'
          variant='outline'
          onClick={() => router.push('/dashboard/campaigns')}
        >
          Cancel
        </Button>
        <Button type='submit' disabled={saving}>
          {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          Create Campaign
        </Button>
      </div>
    </form>
  );
}
