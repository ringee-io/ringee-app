'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconFileCheck, IconLoader2, IconUpload } from '@tabler/icons-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { NumberPurchased } from './my.number.columns';

type RequirementFieldType = 'textual' | 'document' | 'address' | string;

interface RequirementItem {
  id: string;
  name: string;
  description?: string;
  fieldType: RequirementFieldType;
  acceptanceCriteria?: Record<string, unknown> | null;
  example?: string | null;
  status?: string | null;
  reason?: string | null;
  fieldValue?: string | null;
}

function isRejectedStatus(status?: string | null): boolean {
  return /reject|declin|fail/i.test(status ?? '');
}

interface NumberRequirements {
  numberOrderPhoneNumberId: string;
  phoneNumber: string;
  countryCode: string;
  phoneNumberType: string;
  requirementsStatus: string;
  requirementsMet: boolean;
  requirements: RequirementItem[];
}

interface AddressForm {
  businessName: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  streetAddress: string;
  extendedAddress: string;
  locality: string;
  administrativeArea: string;
  postalCode: string;
  countryCode: string;
}

interface RequirementValueState {
  text: string;
  documentId?: string;
  filename?: string;
  uploading?: boolean;
  address: AddressForm;
}

function emptyAddress(countryCode: string): AddressForm {
  return {
    businessName: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    streetAddress: '',
    extendedAddress: '',
    locality: '',
    administrativeArea: '',
    postalCode: '',
    countryCode: countryCode || ''
  };
}

export function VerifyNumberCell({ data }: { data: NumberPurchased }) {
  const t = useTranslations('settings.numbers.verify');
  const [open, setOpen] = useState(false);

  const status = (data.status || '').toLowerCase();
  const actionable = ['pending', 'rejected', 'expired'].includes(status);

  if (!actionable) {
    return <span className='text-muted-foreground'>-</span>;
  }

  const needsFix = status === 'rejected' || status === 'expired';

  return (
    <>
      <Button
        size='sm'
        variant='default'
        className={
          needsFix
            ? 'cursor-pointer bg-red-500 hover:bg-red-600'
            : 'cursor-pointer bg-orange-500 hover:bg-orange-600'
        }
        onClick={() => setOpen(true)}
      >
        {needsFix ? t('ctaFix') : t('cta')}
      </Button>
      {open && (
        <VerifyNumberDialog data={data} open={open} onOpenChange={setOpen} />
      )}
    </>
  );
}

function VerifyNumberDialog({
  data,
  open,
  onOpenChange
}: {
  data: NumberPurchased;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('settings.numbers.verify');
  const api = useApi();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reqs, setReqs] = useState<NumberRequirements | null>(null);
  const [values, setValues] = useState<Record<string, RequirementValueState>>(
    {}
  );

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get<NumberRequirements>(
        `/telephony/phone-numbers/${data.id}/requirements`
      );
      setReqs(res);
      const initial: Record<string, RequirementValueState> = {};
      for (const r of res.requirements) {
        initial[r.id] = {
          text: r.fieldType === 'textual' ? (r.fieldValue ?? '') : '',
          address: emptyAddress(res.countryCode || data.isoCountry)
        };
      }
      setValues(initial);
    } catch {
      toast.error(t('loadError'));
    } finally {
      setLoading(false);
    }
  };

  // Load requirements once when the dialog mounts.
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setValue = (id: string, patch: Partial<RequirementValueState>) =>
    setValues((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const setAddress = (id: string, patch: Partial<AddressForm>) =>
    setValues((prev) => ({
      ...prev,
      [id]: { ...prev[id], address: { ...prev[id].address, ...patch } }
    }));

  const uploadDocument = async (id: string, file: File) => {
    setValue(id, { uploading: true });
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.upload<{ documentId: string; filename: string }>(
        `/telephony/phone-numbers/${data.id}/requirements/documents`,
        fd
      );
      setValue(id, {
        documentId: res.documentId,
        filename: res.filename,
        uploading: false
      });
      toast.success(t('uploadOk'));
    } catch {
      setValue(id, { uploading: false });
      toast.error(t('uploadError'));
    }
  };

  const isComplete = (r: RequirementItem): boolean => {
    const v = values[r.id];
    if (!v) return false;
    if (r.fieldType === 'document') return !!v.documentId;
    if (r.fieldType === 'address') {
      const a = v.address;
      const hasName = !!a.businessName || (!!a.firstName && !!a.lastName);
      return !!a.streetAddress && !!a.locality && !!a.countryCode && hasName;
    }
    return !!v.text.trim();
  };

  const canSubmit =
    !!reqs &&
    reqs.requirements.length > 0 &&
    reqs.requirements.every(isComplete);

  const submit = async () => {
    if (!reqs) return;
    setSubmitting(true);
    try {
      const payload = {
        requirements: reqs.requirements.map((r) => {
          const v = values[r.id];
          if (r.fieldType === 'document') {
            return {
              requirementId: r.id,
              fieldType: 'document',
              documentId: v.documentId
            };
          }
          if (r.fieldType === 'address') {
            const a = v.address;
            return {
              requirementId: r.id,
              fieldType: 'address',
              address: {
                businessName: a.businessName || undefined,
                firstName: a.firstName || undefined,
                lastName: a.lastName || undefined,
                phoneNumber: a.phoneNumber || undefined,
                streetAddress: a.streetAddress,
                extendedAddress: a.extendedAddress || undefined,
                locality: a.locality,
                administrativeArea: a.administrativeArea || undefined,
                postalCode: a.postalCode || undefined,
                countryCode: a.countryCode
              }
            };
          }
          return {
            requirementId: r.id,
            fieldType: 'textual',
            textValue: v.text.trim()
          };
        })
      };

      await api.post(
        `/telephony/phone-numbers/${data.id}/requirements/submit`,
        payload
      );
      toast.success(t('submitOk'));
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error(t('submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] max-w-2xl overflow-hidden'>
        <DialogHeader>
          <DialogTitle>{t('title', { phone: data.phoneNumber })}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className='flex items-center justify-center py-10'>
            <IconLoader2 className='text-muted-foreground h-6 w-6 animate-spin' />
          </div>
        ) : !reqs || reqs.requirements.length === 0 ? (
          <p className='text-muted-foreground py-6 text-sm'>{t('none')}</p>
        ) : (
          <div className='space-y-3'>
            <StatusBanner reqs={reqs} />
            <ScrollArea className='max-h-[50vh] pr-3'>
              <div className='space-y-5'>
                {reqs.requirements.map((r) => (
                  <RequirementRow
                    key={r.id}
                    req={r}
                    value={values[r.id]}
                    onText={(text) => setValue(r.id, { text })}
                    onAddress={(patch) => setAddress(r.id, patch)}
                    onUpload={(file) => uploadDocument(r.id, file)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={!canSubmit || submitting}>
            {submitting && (
              <IconLoader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBanner({ reqs }: { reqs: NumberRequirements }) {
  const t = useTranslations('settings.numbers.verify');

  const hasRejected =
    reqs.requirements.some((r) => isRejectedStatus(r.status)) ||
    isRejectedStatus(reqs.requirementsStatus);
  const underReview = /review/i.test(reqs.requirementsStatus || '');

  if (hasRejected) {
    return (
      <div className='rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20'>
        {t('rejectedBanner')}
      </div>
    );
  }

  if (underReview) {
    return (
      <div className='rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-950/20'>
        {t('underReview')}
      </div>
    );
  }

  return null;
}

function RequirementRow({
  req,
  value,
  onText,
  onAddress,
  onUpload
}: {
  req: RequirementItem;
  value: RequirementValueState;
  onText: (text: string) => void;
  onAddress: (patch: Partial<AddressForm>) => void;
  onUpload: (file: File) => void;
}) {
  const t = useTranslations('settings.numbers.verify');
  const rejected = isRejectedStatus(req.status);

  return (
    <div
      className={
        rejected
          ? 'rounded-lg border border-red-300 bg-red-50 p-4 dark:bg-red-950/20'
          : 'rounded-lg border p-4'
      }
    >
      <div className='mb-1 flex items-center justify-between gap-2'>
        <h4 className='text-sm font-semibold'>{req.name}</h4>
        <div className='flex items-center gap-2'>
          <Badge variant='outline' className='capitalize'>
            {t(`fieldType.${req.fieldType}` as any)}
          </Badge>
          {req.status && (
            <Badge
              variant={rejected ? 'destructive' : 'outline'}
              className='capitalize'
              title={t('statusHint')}
            >
              {req.status}
            </Badge>
          )}
        </div>
      </div>

      {rejected && (
        <p className='mb-2 text-xs font-medium text-red-600'>
          {t('rejectedReason')}: {req.reason || t('rejectedGeneric')}
        </p>
      )}

      {req.description && (
        <p className='text-muted-foreground mb-2 text-xs'>{req.description}</p>
      )}

      <CriteriaHint criteria={req.acceptanceCriteria} example={req.example} />

      <div className='mt-3'>
        {req.fieldType === 'document' ? (
          <DocumentField value={value} onUpload={onUpload} />
        ) : req.fieldType === 'address' ? (
          <AddressFields address={value.address} onChange={onAddress} />
        ) : (
          <Textarea
            value={value.text}
            placeholder={req.example ?? t('valuePlaceholder')}
            onChange={(e) => onText(e.target.value)}
            rows={2}
          />
        )}
      </div>
    </div>
  );
}

function CriteriaHint({
  criteria,
  example
}: {
  criteria?: Record<string, unknown> | null;
  example?: string | null;
}) {
  const t = useTranslations('settings.numbers.verify');
  const entries =
    criteria && typeof criteria === 'object'
      ? Object.entries(criteria).filter(
          ([, v]) => v !== null && v !== undefined && v !== ''
        )
      : [];

  if (entries.length === 0 && !example) return null;

  return (
    <div className='bg-muted/50 rounded-md p-2 text-xs'>
      {entries.length > 0 && (
        <ul className='text-muted-foreground space-y-0.5'>
          {entries.map(([k, v]) => (
            <li key={k}>
              <span className='font-medium capitalize'>
                {k.replace(/_/g, ' ')}:
              </span>{' '}
              {Array.isArray(v) ? v.join(', ') : String(v)}
            </li>
          ))}
        </ul>
      )}
      {example && (
        <p className='text-muted-foreground mt-1'>
          <span className='font-medium'>{t('example')}:</span> {example}
        </p>
      )}
    </div>
  );
}

function DocumentField({
  value,
  onUpload
}: {
  value: RequirementValueState;
  onUpload: (file: File) => void;
}) {
  const t = useTranslations('settings.numbers.verify');

  if (value.documentId) {
    return (
      <div className='flex items-center gap-2 text-sm text-green-600'>
        <IconFileCheck className='h-4 w-4' />
        <span className='truncate'>{value.filename ?? t('uploaded')}</span>
      </div>
    );
  }

  return (
    <label className='border-muted-foreground/30 hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm'>
      {value.uploading ? (
        <IconLoader2 className='h-4 w-4 animate-spin' />
      ) : (
        <IconUpload className='h-4 w-4' />
      )}
      <span className='text-muted-foreground'>
        {value.uploading ? t('uploading') : t('chooseFile')}
      </span>
      <input
        type='file'
        className='hidden'
        accept='.pdf,.png,.jpg,.jpeg,.webp,.heic'
        disabled={value.uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
        }}
      />
    </label>
  );
}

function AddressFields({
  address,
  onChange
}: {
  address: AddressForm;
  onChange: (patch: Partial<AddressForm>) => void;
}) {
  const t = useTranslations('settings.numbers.verify.address');

  const field = (key: keyof AddressForm, label: string, required = false) => (
    <div className='space-y-1'>
      <Label className='text-xs'>
        {label}
        {required && <span className='text-red-500'> *</span>}
      </Label>
      <Input
        value={address[key]}
        onChange={(e) =>
          onChange({ [key]: e.target.value } as Partial<AddressForm>)
        }
      />
    </div>
  );

  return (
    <div className='space-y-3'>
      <p className='text-muted-foreground text-xs'>{t('hint')}</p>
      <div className='grid grid-cols-2 gap-3'>
        {field('businessName', t('businessName'))}
        {field('phoneNumber', t('phoneNumber'))}
        {field('firstName', t('firstName'))}
        {field('lastName', t('lastName'))}
      </div>
      <Separator />
      {field('streetAddress', t('streetAddress'), true)}
      {field('extendedAddress', t('extendedAddress'))}
      <div className='grid grid-cols-2 gap-3'>
        {field('locality', t('locality'), true)}
        {field('administrativeArea', t('administrativeArea'))}
        {field('postalCode', t('postalCode'))}
        {field('countryCode', t('countryCode'), true)}
      </div>
    </div>
  );
}
