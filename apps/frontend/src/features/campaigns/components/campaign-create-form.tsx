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
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import { Loader2, Phone, Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useRotationEnabled } from '@/features/number-rotation';
import type {
  Campaign,
  CreateCampaignDto,
  DialerMode
} from '../types/campaign.types';

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

/** Indexes match `Date.getDay()`; labels come from `common.weekdaysShort`. */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

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
  const t = useTranslations('numberRotation');
  const tc = useTranslations('campaigns');
  const tCommon = useTranslations('common');
  const rotationEnabled = useRotationEnabled();
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

  const rotatableNumbers = [
    ...phoneNumbers.map((n) => ({ id: n.id, phoneNumber: n.phoneNumber })),
    ...callerIds
      .filter((c) => c.verified && c.active !== false)
      .map((c) => ({ id: c.id, phoneNumber: c.phoneNumber }))
  ];

  function toggleRotationNumber(id: string) {
    const current = form.rotationNumberIds ?? [];
    updateForm({
      rotationNumberIds: current.includes(id)
        ? current.filter((n) => n !== id)
        : [...current, id]
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(tc('create.nameRequired'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const campaign = await api.post<Campaign>('/campaigns', form);
      toast.success(tc('create.created'));
      router.push(`/dashboard/campaigns/${campaign.id}`);
    } catch (err: any) {
      const message = err?.message || tc('create.error');
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
          <CardTitle>{tc('create.detailsTitle')}</CardTitle>
          <CardDescription>{tc('create.detailsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='name'>{tc('create.nameLabel')}</Label>
            <Input
              id='name'
              placeholder={tc('create.namePlaceholder')}
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='description'>{tc('fields.description')}</Label>
            <Textarea
              id='description'
              placeholder={tc('create.descriptionPlaceholder')}
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
          <CardTitle>{tc('create.dialerTitle')}</CardTitle>
          <CardDescription>{tc('create.dialerDescription')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {rotationEnabled && (
            <div className='space-y-2'>
              <div className='flex items-center gap-2'>
                <Shuffle className='h-4 w-4 text-emerald-600' />
                <Label>{t('campaign.title')}</Label>
              </div>
              <p className='text-muted-foreground text-xs'>
                {t('campaign.hint')}
              </p>
              {rotatableNumbers.length === 0 ? (
                <p className='text-muted-foreground text-sm'>
                  {t('campaign.empty')}
                </p>
              ) : (
                <div className='rounded-md border'>
                  {rotatableNumbers.map((num) => (
                    <div
                      key={num.id}
                      className='flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0'
                    >
                      <span className='flex items-center gap-2 text-sm'>
                        <Phone className='text-muted-foreground h-3.5 w-3.5' />
                        {num.phoneNumber}
                      </span>
                      <Switch
                        checked={(form.rotationNumberIds ?? []).includes(
                          num.id
                        )}
                        onCheckedChange={() => toggleRotationNumber(num.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
              {(form.rotationNumberIds ?? []).length === 0 && (
                <p className='text-muted-foreground text-xs'>
                  {t('campaign.allHint')}
                </p>
              )}
            </div>
          )}

          {!rotationEnabled && (
            <>
              <div className='space-y-2'>
                <Label>{tc('fields.phoneNumber')}</Label>
                <Select
                  value={form.numberPurchasedId || ''}
                  onValueChange={(v) =>
                    updateForm({ numberPurchasedId: v || undefined })
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={tc('fields.phoneNumberPlaceholder')}
                    />
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
                        {tc('fields.noPurchasedNumbers')}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className='text-muted-foreground text-xs'>
                  {tc('fields.phoneNumberHint')}
                </p>
              </div>

              <div className='space-y-2'>
                <Label>{tc('fields.callerIdOptional')}</Label>
                <Select
                  value={form.callerIdId || '__default'}
                  onValueChange={(v) =>
                    updateForm({
                      callerIdId: v === '__default' ? undefined : v
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={tc('fields.callerIdPlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='__default'>
                      {tc('fields.callerIdDefault')}
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
                  {tc('create.callerIdHint')}
                </p>
              </div>
            </>
          )}
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label>{tc('fields.mode')}</Label>
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
                    {tc('modes.progressiveHint')}
                  </SelectItem>
                  <SelectItem value='preview'>
                    {tc('modes.previewHint')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='maxAttempts'>
                {tc('fields.maxAttemptsPerLead')}
              </Label>
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
              <Label htmlFor='wrapUp'>{tc('fields.wrapUp')}</Label>
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
              <Label htmlFor='retryDelay'>{tc('fields.retryDelay')}</Label>
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
          <CardTitle>{tc('schedule.title')}</CardTitle>
          <CardDescription>{tc('schedule.description')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label>{tc('schedule.timezone')}</Label>
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
              <Label htmlFor='workStart'>{tc('schedule.startTime')}</Label>
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
              <Label htmlFor='workEnd'>{tc('schedule.endTime')}</Label>
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
            <Label>{tc('schedule.workingDays')}</Label>
            <div className='flex flex-wrap gap-2'>
              {DAY_KEYS.map((day, idx) => {
                const selected = (form.workDays ?? []).includes(idx);
                return (
                  <Button
                    key={day}
                    type='button'
                    variant={selected ? 'default' : 'outline'}
                    size='sm'
                    onClick={() => toggleDay(idx)}
                  >
                    {tCommon(`weekdaysShort.${day}`)}
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
          {tCommon('cancel')}
        </Button>
        <Button type='submit' disabled={saving}>
          {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {tc('create.submit')}
        </Button>
      </div>
    </form>
  );
}
