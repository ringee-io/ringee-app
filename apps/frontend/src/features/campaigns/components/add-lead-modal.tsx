'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface ImportResult {
  success: boolean;
  summary: {
    totalRows: number;
    contactsCreated: number;
    leadsAdded: number;
    duplicatesSkipped: number;
    invalidRows: number;
    errors: { row: number; field?: string; message: string }[];
  };
}

interface Props {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}

const EMPTY = {
  name: '',
  phone: '',
  email: '',
  company: '',
  jobTitle: '',
  state: '',
  website: '',
  revenue: '',
  companySize: ''
};

// Loosely validate E.164: optional leading +, 7–15 digits.
const E164 = /^\+?[1-9]\d{6,14}$/;

export function AddLeadModal({
  campaignId,
  open,
  onOpenChange,
  onAdded
}: Props) {
  const api = useApi();
  const t = useTranslations('campaigns.addLead');
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(patch: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setForm({ ...EMPTY });
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();

    if (!name) return setError(t('errors.nameRequired'));
    if (!phone) return setError(t('errors.phoneRequired'));
    if (!E164.test(phone)) {
      return setError(t('errors.phoneFormat'));
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setError(t('errors.emailInvalid'));
    }

    setSaving(true);
    try {
      const res = await api.post<ImportResult>(
        `/campaigns/${campaignId}/leads/manual`,
        {
          leads: [
            {
              name,
              phone,
              email: email || undefined,
              company: form.company.trim() || undefined,
              jobTitle: form.jobTitle.trim() || undefined,
              state: form.state.trim() || undefined,
              website: form.website.trim() || undefined,
              revenue: form.revenue.trim() || undefined,
              companySize: form.companySize.trim() || undefined
            }
          ]
        }
      );

      if (res.summary.leadsAdded > 0) {
        toast.success(t('toasts.added'));
        setForm({ ...EMPTY });
        onAdded?.();
        onOpenChange(false);
      } else if (res.summary.duplicatesSkipped > 0) {
        setError(t('errors.duplicate'));
      } else {
        setError(t('errors.notAdded'));
      }
    } catch (err: any) {
      const message = err?.message || t('errors.generic');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-h-[90vh] max-w-md overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-4'>
          {error && (
            <div className='bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm'>
              {error}
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='lead-name'>{t('name')}</Label>
            <Input
              id='lead-name'
              placeholder={t('namePlaceholder')}
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              autoFocus
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='lead-phone'>{t('phone')}</Label>
            <Input
              id='lead-phone'
              placeholder='+14155552671'
              value={form.phone}
              onChange={(e) => update({ phone: e.target.value })}
            />
            <p className='text-muted-foreground text-xs'>{t('phoneHint')}</p>
          </div>

          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='lead-email'>{t('email')}</Label>
              <Input
                id='lead-email'
                type='email'
                placeholder='john@acme.com'
                value={form.email}
                onChange={(e) => update({ email: e.target.value })}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='lead-company'>{t('company')}</Label>
              <Input
                id='lead-company'
                placeholder='Acme Inc'
                value={form.company}
                onChange={(e) => update({ company: e.target.value })}
              />
            </div>
          </div>

          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='lead-job-title'>{t('jobTitle')}</Label>
              <Input
                id='lead-job-title'
                placeholder={t('jobTitlePlaceholder')}
                value={form.jobTitle}
                onChange={(e) => update({ jobTitle: e.target.value })}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='lead-state'>{t('state')}</Label>
              <Input
                id='lead-state'
                placeholder='New York'
                value={form.state}
                onChange={(e) => update({ state: e.target.value })}
              />
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='lead-website'>{t('website')}</Label>
            <Input
              id='lead-website'
              placeholder='https://acme.com'
              value={form.website}
              onChange={(e) => update({ website: e.target.value })}
            />
          </div>

          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='lead-revenue'>{t('revenue')}</Label>
              <Input
                id='lead-revenue'
                placeholder='$10M-$50M'
                value={form.revenue}
                onChange={(e) => update({ revenue: e.target.value })}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='lead-size'>{t('companySize')}</Label>
              <Input
                id='lead-size'
                placeholder='51-200'
                value={form.companySize}
                onChange={(e) => update({ companySize: e.target.value })}
              />
            </div>
          </div>

          <div className='flex justify-end gap-2 pt-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => handleOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button type='submit' disabled={saving}>
              {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
