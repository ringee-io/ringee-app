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
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import { Loader2, Phone, Shuffle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useRotationEnabled } from '@/features/number-rotation';
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

interface Props {
  campaign: Campaign;
  onUpdated: () => void;
}

export function CampaignSettingsTab({ campaign, onUpdated }: Props) {
  const api = useApi();
  const router = useRouter();
  const t = useTranslations('numberRotation');
  const tc = useTranslations('campaigns');
  const tCommon = useTranslations('common');
  const rotationEnabled = useRotationEnabled();
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
    rotationNumberIds: campaign.rotationNumberIds || [],
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

  // Owned numbers eligible for this campaign's rotation: purchased DIDs plus
  // verified, active caller IDs.
  const rotatableNumbers = [
    ...phoneNumbers.map((n) => ({ id: n.id, phoneNumber: n.phoneNumber })),
    ...callerIds
      .filter((c) => c.verified && c.active !== false)
      .map((c) => ({ id: c.id, phoneNumber: c.phoneNumber }))
  ];

  function toggleRotationNumber(id: string) {
    updateForm({
      rotationNumberIds: form.rotationNumberIds.includes(id)
        ? form.rotationNumberIds.filter((n) => n !== id)
        : [...form.rotationNumberIds, id]
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
        numberPurchasedId: form.numberPurchasedId || null,
        rotationNumberIds: form.rotationNumberIds
      });
      onUpdated();
      toast.success(tc('settings.toasts.saved'));
    } catch (err: any) {
      const message = err?.message || tc('settings.toasts.saveError');
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
      toast.success(tc('settings.toasts.deleted'));
      router.push('/dashboard/campaigns');
    } catch (err: any) {
      const message = err?.message || tc('settings.toasts.deleteError');
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
          <CardTitle>{tc('settings.general')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='settings-name'>{tc('fields.name')}</Label>
            <Input
              id='settings-name'
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='settings-desc'>{tc('fields.description')}</Label>
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
          <CardTitle>{tc('settings.dialer')}</CardTitle>
          <CardDescription>
            {!isDraft && tc('settings.lockedHint')}
          </CardDescription>
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
                <div className='divide-border/50 rounded-md border'>
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
                        checked={form.rotationNumberIds.includes(num.id)}
                        onCheckedChange={() => toggleRotationNumber(num.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
              <p className='text-muted-foreground text-xs'>
                {form.rotationNumberIds.length === 0
                  ? t('campaign.allHint')
                  : null}
              </p>
            </div>
          )}

          {!rotationEnabled && (
            <>
              <div className='space-y-2'>
                <Label>{tc('fields.phoneNumber')}</Label>
                <Select
                  value={form.numberPurchasedId || ''}
                  onValueChange={(v) => updateForm({ numberPurchasedId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tc('fields.phoneNumberPlaceholder')} />
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
                    updateForm({ callerIdId: v === '__default' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tc('fields.callerIdPlaceholder')} />
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
                  {tc('fields.callerIdHint')}
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
                disabled={!isDraft}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='progressive'>
                    {tc('modes.progressive')}
                  </SelectItem>
                  <SelectItem value='preview'>{tc('modes.preview')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='s-attempts'>{tc('fields.maxAttempts')}</Label>
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
              <Label htmlFor='s-wrap'>{tc('fields.wrapUpShort')}</Label>
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
              <Label htmlFor='s-retry'>{tc('fields.retryDelayShort')}</Label>
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
          <CardTitle>{tc('schedule.title')}</CardTitle>
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
              <Label>{tc('schedule.startTime')}</Label>
              <Input
                type='time'
                value={minutesToTime(form.workStartMin)}
                onChange={(e) =>
                  updateForm({ workStartMin: timeToMinutes(e.target.value) })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label>{tc('schedule.endTime')}</Label>
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
            <Label>{tc('schedule.workingDays')}</Label>
            <div className='flex flex-wrap gap-2'>
              {DAY_KEYS.map((day, idx) => (
                <Button
                  key={day}
                  type='button'
                  variant={form.workDays.includes(idx) ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => toggleDay(idx)}
                >
                  {tCommon(`weekdaysShort.${day}`)}
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
                {tc('settings.deleteAction')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {tc('settings.deleteDialog.title')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {tc('settings.deleteDialog.description', {
                    name: campaign.name
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {tc('settings.deleteDialog.cancel')}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                >
                  {deleting && (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  )}
                  {tc('settings.deleteDialog.confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <div />
        )}

        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {tc('settings.save')}
        </Button>
      </div>
    </div>
  );
}
