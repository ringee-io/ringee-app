'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCircleCheck,
  IconCircleDashed,
  IconFileText,
  IconLoader2,
  IconLock,
  IconMail,
  IconMapPinCheck,
  IconPaperclip,
  IconShieldCheck
} from '@tabler/icons-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Progress } from '@ringee/frontend-shared/components/ui/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import { cn } from '@ringee/frontend-shared/lib/utils';
import PhoneInput, {
  type Country,
  type Value as PhoneValue
} from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { DocumentPickerModal } from './document.picker.modal';

const MY_NUMBERS_HREF = '/dashboard/buy-number?tab=my-numbers';
const SUPPORT_EMAIL = 'hello@ringee.io';

type RequirementFieldType = 'textual' | 'document' | 'address' | string;

interface RequirementDraft {
  textValue?: string | null;
  address?: Record<string, unknown> | null;
  document?: { id: string; filename: string } | null;
}

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
  draft?: RequirementDraft | null;
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
  regulatoryDocumentId?: string;
  documentFilename?: string;
  address: AddressForm;
}

function addressFromDraft(
  draft: Record<string, unknown> | null | undefined,
  countryCode: string
): AddressForm {
  const base = emptyAddress(countryCode);
  if (!draft) return base;
  const str = (key: keyof AddressForm) =>
    typeof draft[key] === 'string' ? (draft[key] as string) : base[key];
  return {
    businessName: str('businessName'),
    firstName: str('firstName'),
    lastName: str('lastName'),
    phoneNumber: str('phoneNumber'),
    streetAddress: str('streetAddress'),
    extendedAddress: str('extendedAddress'),
    locality: str('locality'),
    administrativeArea: str('administrativeArea'),
    postalCode: str('postalCode'),
    countryCode: str('countryCode') || countryCode
  };
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

export function VerifyNumberScreen({ numberId }: { numberId: string }) {
  const t = useTranslations('settings.numbers.verify');
  const api = useApi();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const [reqs, setReqs] = useState<NumberRequirements | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, RequirementValueState>>(
    {}
  );

  // Skips the autosave that the initial prefill would otherwise trigger.
  const hydratedRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setErrored(false);
      hydratedRef.current = false;
      const res = await api.get<NumberRequirements>(
        `/telephony/phone-numbers/${numberId}/requirements`
      );
      setReqs(res);
      const initial: Record<string, RequirementValueState> = {};
      for (const r of res.requirements) {
        const draft = r.draft ?? null;
        initial[r.id] = {
          text: draft?.textValue ?? '',
          regulatoryDocumentId: draft?.document?.id,
          documentFilename: draft?.document?.filename,
          address: addressFromDraft(draft?.address, res.countryCode)
        };
      }
      setValues(initial);
    } catch {
      setErrored(true);
      toast.error(t('loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numberId]);

  const setValue = (id: string, patch: Partial<RequirementValueState>) =>
    setValues((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const setAddress = (id: string, patch: Partial<AddressForm>) =>
    setValues((prev) => ({
      ...prev,
      [id]: { ...prev[id], address: { ...prev[id].address, ...patch } }
    }));

  /** Builds the requirement payload shared by autosave (draft) and submit. */
  const buildItems = () =>
    (reqs?.requirements ?? []).map((r) => {
      const v = values[r.id];
      if (r.fieldType === 'document') {
        return {
          requirementId: r.id,
          fieldType: 'document' as const,
          regulatoryDocumentId: v?.regulatoryDocumentId
        };
      }
      if (r.fieldType === 'address') {
        const a = v.address;
        return {
          requirementId: r.id,
          fieldType: 'address' as const,
          address: {
            businessName: a.businessName || undefined,
            firstName: a.firstName || undefined,
            lastName: a.lastName || undefined,
            phoneNumber: a.phoneNumber || undefined,
            streetAddress: a.streetAddress || undefined,
            extendedAddress: a.extendedAddress || undefined,
            locality: a.locality || undefined,
            administrativeArea: a.administrativeArea || undefined,
            postalCode: a.postalCode || undefined,
            countryCode: a.countryCode || undefined
          }
        };
      }
      return {
        requirementId: r.id,
        fieldType: 'textual' as const,
        textValue: v.text
      };
    });

  // Silent debounced autosave so a reload restores everything the user typed.
  useEffect(() => {
    if (!reqs) return;
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    setSavedDraft(false);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      setSavingDraft(true);
      api
        .put(`/telephony/phone-numbers/${numberId}/requirements/draft`, {
          requirements: buildItems()
        })
        .then(() => setSavedDraft(true))
        .catch(() => {
          /* autosave is best-effort; never interrupt the user */
        })
        .finally(() => setSavingDraft(false));
    }, 800);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  const isComplete = (r: RequirementItem): boolean => {
    const v = values[r.id];
    if (!v) return false;
    if (r.fieldType === 'document') return !!v.regulatoryDocumentId;
    if (r.fieldType === 'address') {
      const a = v.address;
      const hasName = !!a.businessName || (!!a.firstName && !!a.lastName);
      return !!a.streetAddress && !!a.locality && !!a.countryCode && hasName;
    }
    return !!v.text.trim();
  };

  const total = reqs?.requirements.length ?? 0;
  const completed = reqs?.requirements.filter(isComplete).length ?? 0;
  const canSubmit = total > 0 && completed === total;

  const submit = async () => {
    if (!reqs) return;
    setSubmitting(true);
    try {
      await api.post(
        `/telephony/phone-numbers/${numberId}/requirements/submit`,
        {
          requirements: buildItems()
        }
      );
      toast.success(t('submitOk'));
      router.push(MY_NUMBERS_HREF);
      router.refresh();
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      toast.error(
        code === 'ADDRESS_VALIDATION_FAILED'
          ? t('submitAddressInvalid')
          : t('submitError')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className='space-y-6'>
      <BackLink label={t('back')} />

      {loading ? (
        <LoadingState />
      ) : errored ? (
        <ErrorState onRetry={load} />
      ) : !reqs || reqs.requirements.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <HeroHeader reqs={reqs} />
          <StatusBanner reqs={reqs} />

          <div className='grid gap-6 lg:grid-cols-3'>
            <div className='space-y-4 lg:col-span-2'>
              <h2 className='text-sm font-semibold tracking-tight'>
                {t('requirementsHeading')}
              </h2>
              {reqs.requirements.map((r, index) => (
                <RequirementRow
                  key={r.id}
                  index={index + 1}
                  req={r}
                  value={values[r.id]}
                  complete={isComplete(r)}
                  onText={(text) => setValue(r.id, { text })}
                  onAddress={(patch) => setAddress(r.id, patch)}
                  onPickDocument={() => setPickerFor(r.id)}
                />
              ))}
            </div>

            <div className='lg:col-span-1'>
              <SummaryPanel
                completed={completed}
                total={total}
                canSubmit={canSubmit}
                submitting={submitting}
                savingDraft={savingDraft}
                savedDraft={savedDraft}
                onSubmit={submit}
              />
            </div>
          </div>

          <DocumentPickerModal
            open={pickerFor !== null}
            onOpenChange={(open) => {
              if (!open) setPickerFor(null);
            }}
            selectedDocumentId={
              pickerFor ? values[pickerFor]?.regulatoryDocumentId : undefined
            }
            onSelect={(doc) => {
              if (pickerFor) {
                setValue(pickerFor, {
                  regulatoryDocumentId: doc.id,
                  documentFilename: doc.filename
                });
              }
            }}
          />
        </>
      )}
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href={MY_NUMBERS_HREF}
      className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors'
    >
      <IconArrowLeft className='h-4 w-4' />
      {label}
    </Link>
  );
}

function HeroHeader({ reqs }: { reqs: NumberRequirements }) {
  const t = useTranslations('settings.numbers.verify');

  return (
    <div className='bg-card rounded-xl border p-6'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-start'>
        <div className='bg-primary/10 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-full'>
          <IconShieldCheck className='h-6 w-6' />
        </div>
        <div className='min-w-0 flex-1 space-y-2'>
          <h1 className='text-xl font-semibold tracking-tight'>
            {t('title', { phone: reqs.phoneNumber })}
          </h1>
          <p className='text-muted-foreground max-w-2xl text-sm'>
            {t('subtitle')}
          </p>
          <div className='flex flex-wrap items-center gap-2 pt-1'>
            <Badge variant='outline' className='uppercase'>
              {reqs.countryCode}
            </Badge>
            {reqs.phoneNumberType && (
              <Badge variant='outline' className='capitalize'>
                {reqs.phoneNumberType}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
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
      <Alert variant='destructive'>
        <AlertTitle>{t('rejectedTitle')}</AlertTitle>
        <AlertDescription>{t('rejectedBanner')}</AlertDescription>
      </Alert>
    );
  }

  if (underReview) {
    return (
      <Alert className='border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200'>
        <AlertTitle>{t('underReviewTitle')}</AlertTitle>
        <AlertDescription className='text-blue-700 dark:text-blue-300'>
          {t('underReview')}
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

function SummaryPanel({
  completed,
  total,
  canSubmit,
  submitting,
  savingDraft,
  savedDraft,
  onSubmit
}: {
  completed: number;
  total: number;
  canSubmit: boolean;
  submitting: boolean;
  savingDraft: boolean;
  savedDraft: boolean;
  onSubmit: () => void;
}) {
  const t = useTranslations('settings.numbers.verify');
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className='space-y-4 lg:sticky lg:top-6'>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>{t('progressLabel')}</CardTitle>
          <CardDescription>
            {t('progressCount', { done: completed, total })}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Progress value={pct} />
          <p className='text-muted-foreground text-sm'>
            {canSubmit ? t('readyToSubmit') : t('remainingItems')}
          </p>
          <Button
            className='w-full'
            onClick={onSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting && (
              <IconLoader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            {t('submit')}
          </Button>
          <div className='flex h-4 items-center justify-center'>
            {savingDraft ? (
              <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                <IconLoader2 className='h-3 w-3 animate-spin' />
                {t('savingDraft')}
              </span>
            ) : savedDraft ? (
              <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                <IconCircleCheck className='h-3 w-3' />
                {t('savedDraft')}
              </span>
            ) : null}
          </div>
          <div className='text-muted-foreground flex items-start gap-2 text-xs'>
            <IconLock className='mt-0.5 h-3.5 w-3.5 shrink-0' />
            <span>{t('secureNote')}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>{t('helpTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className='text-muted-foreground space-y-3 text-sm'>
            {[t('helpStep1'), t('helpStep2'), t('helpStep3')].map((step, i) => (
              <li key={i} className='flex gap-3'>
                <span className='bg-muted text-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium'>
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <Separator className='my-4' />

          <div className='flex items-start gap-2.5'>
            <div className='bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full'>
              <IconMail className='h-4 w-4' />
            </div>
            <div className='space-y-0.5 text-sm'>
              <p className='text-muted-foreground'>{t('supportNote')}</p>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className='text-primary font-medium hover:underline'
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RequirementRow({
  index,
  req,
  value,
  complete,
  onText,
  onAddress,
  onPickDocument
}: {
  index: number;
  req: RequirementItem;
  value: RequirementValueState;
  complete: boolean;
  onText: (text: string) => void;
  onAddress: (patch: Partial<AddressForm>) => void;
  onPickDocument: () => void;
}) {
  const t = useTranslations('settings.numbers.verify');
  const rejected = isRejectedStatus(req.status);

  return (
    <div
      className={cn(
        'rounded-xl border p-5 transition-colors',
        rejected
          ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/20'
          : complete
            ? 'border-green-300 bg-green-50/40 dark:border-green-900 dark:bg-green-950/10'
            : 'bg-card'
      )}
    >
      <div className='mb-3 flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-3'>
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
              complete
                ? 'bg-green-500 text-white'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {complete ? <IconCircleCheck className='h-4 w-4' /> : index}
          </span>
          <div className='min-w-0'>
            <h4 className='text-sm font-semibold'>{req.name}</h4>
            {req.description && (
              <p className='text-muted-foreground mt-0.5 text-xs'>
                {req.description}
              </p>
            )}
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <Badge variant='outline' className='capitalize'>
            {t(`fieldType.${req.fieldType}` as never)}
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
        <p className='mb-3 text-xs font-medium text-red-600 dark:text-red-400'>
          {t('rejectedReason')}: {req.reason || t('rejectedGeneric')}
        </p>
      )}

      <CriteriaHint criteria={req.acceptanceCriteria} example={req.example} />

      <div className='mt-3'>
        {req.fieldType === 'document' ? (
          <DocumentField value={value} onPick={onPickDocument} />
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
    <div className='bg-muted/50 rounded-md p-2.5 text-xs'>
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
  onPick
}: {
  value: RequirementValueState;
  onPick: () => void;
}) {
  const t = useTranslations('settings.numbers.verify');

  if (value.regulatoryDocumentId) {
    return (
      <button
        type='button'
        onClick={onPick}
        className='flex w-full items-center gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2.5 text-left text-sm text-green-700 transition-colors hover:bg-green-100 dark:border-green-900 dark:bg-green-950/20 dark:text-green-400 dark:hover:bg-green-950/40'
      >
        <IconFileText className='h-4 w-4 shrink-0' />
        <span className='flex-1 truncate'>
          {value.documentFilename ?? t('selectedDocument')}
        </span>
        <span className='text-xs font-medium underline'>{t('change')}</span>
      </button>
    );
  }

  return (
    <button
      type='button'
      onClick={onPick}
      className='border-muted-foreground/30 hover:border-muted-foreground/60 hover:bg-muted/50 flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-4 text-sm transition-colors'
    >
      <IconPaperclip className='h-4 w-4' />
      <span className='text-muted-foreground'>{t('selectDocument')}</span>
    </button>
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
  const api = useApi();

  const [validating, setValidating] = useState(false);
  const [feedback, setFeedback] = useState<AddressFeedback>(null);

  // Editing any field invalidates a previous validation result.
  const handleChange = (patch: Partial<AddressForm>) => {
    setFeedback(null);
    onChange(patch);
  };

  const field = (key: keyof AddressForm, label: string, required = false) => (
    <div className='space-y-1'>
      <Label className='text-xs'>
        {label}
        {required && <span className='text-red-500'> *</span>}
      </Label>
      <Input
        value={address[key]}
        onChange={(e) =>
          handleChange({ [key]: e.target.value } as Partial<AddressForm>)
        }
      />
    </div>
  );

  const defaultCountry = /^[A-Za-z]{2}$/.test(address.countryCode)
    ? (address.countryCode.toUpperCase() as Country)
    : undefined;

  const phoneField = (
    <div className='space-y-1'>
      <Label className='text-xs'>{t('phoneNumber')}</Label>
      <PhoneInput
        international
        defaultCountry={defaultCountry}
        value={(address.phoneNumber || undefined) as PhoneValue | undefined}
        onChange={(value) => handleChange({ phoneNumber: value ?? '' })}
        className='border-input focus-within:ring-primary flex h-9 items-center rounded-md border bg-transparent px-3 text-sm focus-within:ring-2'
      />
    </div>
  );

  const canValidate =
    !!address.streetAddress.trim() &&
    !!address.postalCode.trim() &&
    !!address.countryCode.trim();

  const validate = async () => {
    setValidating(true);
    setFeedback(null);
    try {
      const res = await api.post<AddressValidationResponse>(
        '/telephony/addresses/validate',
        {
          countryCode: address.countryCode,
          postalCode: address.postalCode,
          streetAddress: address.streetAddress,
          locality: address.locality || undefined,
          administrativeArea: address.administrativeArea || undefined,
          extendedAddress: address.extendedAddress || undefined
        }
      );
      if (res.result === 'valid') {
        setFeedback({ type: 'valid' });
      } else if (res.suggested && hasSuggestion(res.suggested)) {
        setFeedback({ type: 'suggestion', suggested: res.suggested });
      } else {
        setFeedback({ type: 'invalid' });
      }
    } catch {
      toast.error(t('validateError'));
    } finally {
      setValidating(false);
    }
  };

  const applySuggestion = (s: AddressSuggestion) => {
    const patch: Partial<AddressForm> = {};
    if (s.streetAddress) patch.streetAddress = s.streetAddress;
    if (s.extendedAddress) patch.extendedAddress = s.extendedAddress;
    if (s.locality) patch.locality = s.locality;
    if (s.administrativeArea) patch.administrativeArea = s.administrativeArea;
    if (s.postalCode) patch.postalCode = s.postalCode;
    if (s.countryCode) patch.countryCode = s.countryCode;
    onChange(patch);
    setFeedback({ type: 'valid' });
  };

  return (
    <div className='space-y-3'>
      <p className='text-muted-foreground text-xs'>{t('hint')}</p>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        {field('businessName', t('businessName'))}
        {phoneField}
        {field('firstName', t('firstName'))}
        {field('lastName', t('lastName'))}
      </div>
      <Separator />
      {field('streetAddress', t('streetAddress'), true)}
      {field('extendedAddress', t('extendedAddress'))}
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        {field('locality', t('locality'), true)}
        {field('administrativeArea', t('administrativeArea'))}
        {field('postalCode', t('postalCode'))}
        {field('countryCode', t('countryCode'), true)}
      </div>

      <div className='flex items-center gap-3 pt-1'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={validate}
          disabled={!canValidate || validating}
        >
          {validating ? (
            <IconLoader2 className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <IconMapPinCheck className='mr-2 h-4 w-4' />
          )}
          {t('validate')}
        </Button>
        <span className='text-muted-foreground text-xs'>
          {t('validateHint')}
        </span>
      </div>

      <AddressValidationFeedback
        feedback={feedback}
        onApply={applySuggestion}
      />
    </div>
  );
}

interface AddressSuggestion {
  streetAddress?: string;
  extendedAddress?: string;
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  countryCode?: string;
}

interface AddressValidationResponse {
  result: 'valid' | 'invalid';
  suggested?: AddressSuggestion;
  errors?: { field?: string; message?: string }[];
}

type AddressFeedback =
  | null
  | { type: 'valid' }
  | { type: 'invalid' }
  | { type: 'suggestion'; suggested: AddressSuggestion };

function hasSuggestion(s: AddressSuggestion): boolean {
  return Object.values(s).some((v) => typeof v === 'string' && v.trim() !== '');
}

function AddressValidationFeedback({
  feedback,
  onApply
}: {
  feedback: AddressFeedback;
  onApply: (s: AddressSuggestion) => void;
}) {
  const t = useTranslations('settings.numbers.verify.address');
  if (!feedback) return null;

  if (feedback.type === 'valid') {
    return (
      <div className='flex items-center gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900 dark:bg-green-950/20 dark:text-green-400'>
        <IconCircleCheck className='h-4 w-4 shrink-0' />
        {t('validated')}
      </div>
    );
  }

  if (feedback.type === 'invalid') {
    return (
      <div className='flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-500'>
        <IconAlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
        {t('invalid')}
      </div>
    );
  }

  const s = feedback.suggested;
  const line = [
    s.streetAddress,
    s.extendedAddress,
    s.locality,
    s.administrativeArea,
    s.postalCode,
    s.countryCode
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className='space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20'>
      <div className='flex items-start gap-2 text-xs text-amber-700 dark:text-amber-500'>
        <IconAlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
        <div className='space-y-1'>
          <p className='font-medium'>{t('suggestionTitle')}</p>
          <p className='text-amber-800 dark:text-amber-300'>{line}</p>
        </div>
      </div>
      <Button
        type='button'
        size='sm'
        variant='outline'
        className='border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300'
        onClick={() => onApply(s)}
      >
        {t('useSuggestion')}
      </Button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className='space-y-6'>
      <Skeleton className='h-28 w-full rounded-xl' />
      <div className='grid gap-6 lg:grid-cols-3'>
        <div className='space-y-4 lg:col-span-2'>
          <Skeleton className='h-40 w-full rounded-xl' />
          <Skeleton className='h-40 w-full rounded-xl' />
        </div>
        <Skeleton className='h-64 w-full rounded-xl' />
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('settings.numbers.verify');
  return (
    <Card>
      <CardContent className='flex flex-col items-center gap-4 py-12 text-center'>
        <div className='bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full'>
          <IconCircleDashed className='h-6 w-6' />
        </div>
        <p className='text-muted-foreground text-sm'>{t('loadError')}</p>
        <Button variant='outline' onClick={onRetry}>
          {t('retry')}
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  const t = useTranslations('settings.numbers.verify');
  return (
    <Card>
      <CardContent className='flex flex-col items-center gap-4 py-12 text-center'>
        <div className='flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/30 dark:text-green-400'>
          <IconCircleCheck className='h-6 w-6' />
        </div>
        <div className='space-y-1'>
          <p className='text-sm font-medium'>{t('noneTitle')}</p>
          <p className='text-muted-foreground text-sm'>{t('none')}</p>
        </div>
        <Button asChild variant='outline'>
          <Link href={MY_NUMBERS_HREF}>{t('back')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
