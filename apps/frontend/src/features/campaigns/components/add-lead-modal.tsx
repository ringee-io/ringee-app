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

const EMPTY = { name: '', phone: '', email: '', company: '' };

// Loosely validate E.164: optional leading +, 7–15 digits.
const E164 = /^\+?[1-9]\d{6,14}$/;

export function AddLeadModal({
  campaignId,
  open,
  onOpenChange,
  onAdded
}: Props) {
  const api = useApi();
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

    if (!name) return setError('Name is required.');
    if (!phone) return setError('Phone number is required.');
    if (!E164.test(phone)) {
      return setError(
        'Phone must be in international format, e.g. +14155552671.'
      );
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setError('Please enter a valid email address.');
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
              company: form.company.trim() || undefined
            }
          ]
        }
      );

      if (res.summary.leadsAdded > 0) {
        toast.success('Lead added to the campaign.');
        setForm({ ...EMPTY });
        onAdded?.();
        onOpenChange(false);
      } else if (res.summary.duplicatesSkipped > 0) {
        setError('This contact is already a lead in this campaign.');
      } else {
        setError(
          'The lead could not be added. Please check the details and try again.'
        );
      }
    } catch (err: any) {
      const message =
        err?.message || 'Could not add the lead. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Add Lead Manually</DialogTitle>
          <DialogDescription>
            Type the contact details to add a single lead to this campaign. The
            contact is created automatically if it doesn&apos;t exist yet.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-4'>
          {error && (
            <div className='bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm'>
              {error}
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='lead-name'>Name *</Label>
            <Input
              id='lead-name'
              placeholder='John Doe'
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              autoFocus
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='lead-phone'>Phone *</Label>
            <Input
              id='lead-phone'
              placeholder='+14155552671'
              value={form.phone}
              onChange={(e) => update({ phone: e.target.value })}
            />
            <p className='text-muted-foreground text-xs'>
              International format (E.164), e.g. +14155552671.
            </p>
          </div>

          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='lead-email'>Email</Label>
              <Input
                id='lead-email'
                type='email'
                placeholder='john@acme.com'
                value={form.email}
                onChange={(e) => update({ email: e.target.value })}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='lead-company'>Company</Label>
              <Input
                id='lead-company'
                placeholder='Acme Inc'
                value={form.company}
                onChange={(e) => update({ company: e.target.value })}
              />
            </div>
          </div>

          <div className='flex justify-end gap-2 pt-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={saving}>
              {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Add Lead
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
