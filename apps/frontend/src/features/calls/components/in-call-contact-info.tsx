'use client';

import { useEffect, useId, useState } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import { toast } from 'sonner';
import { Pencil, X, Check, UserCircle2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import {
  ExternalProfileButtons,
  type ExternalProfileLabels
} from '@ringee/frontend-shared/components/external-profile-links';

type ContactPayload = {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  fullName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  organization?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  locationRegion?: string | null;
  locationCity?: string | null;
  locationCountry?: string | null;
  locationCountryCode?: string | null;
  locationPostalCode?: string | null;
  timezone?: string | null;
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  githubUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  tiktokUrl?: string | null;
  blogUrl?: string | null;
  calendlyUrl?: string | null;
  headline?: string | null;
  summary?: string | null;
  seniority?: string | null;
  department?: string | null;
  yearsExperience?: number | null;
  languages?: string[] | null;
  skills?: string[] | null;
  interests?: string[] | null;
  education?: unknown;
  workHistory?: unknown;
  customFields?: unknown;
  source?: string | null;
  status?: string | null;
  lifecycleStage?: string | null;
  score?: number | null;
  birthday?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  doNotCall?: boolean | null;
  unsubscribed?: boolean | null;
  emailVerified?: boolean | null;
  phoneVerified?: boolean | null;
  phones?: Array<
    | {
        id?: string | null;
        phone?: string | null;
        type?: string | null;
      }
    | null
    | undefined
  > | null;
  emails?: Array<
    | {
        id?: string | null;
        email?: string | null;
        type?: string | null;
      }
    | null
    | undefined
  > | null;
  tags?: Array<
    | {
        tag?: { id?: string | null; name?: string | null } | null;
      }
    | null
    | undefined
  > | null;
  notes?: Array<
    | {
        id?: string | null;
        content?: string | null;
      }
    | null
    | undefined
  > | null;
  affiliations?: Array<
    | {
        id?: string | null;
        role?: string | null;
        isPrimary?: boolean | null;
        company?: {
          name?: string | null;
          domain?: string | null;
          industry?: string | null;
          subIndustry?: string | null;
          description?: string | null;
          shortDescription?: string | null;
          size?: string | null;
          employeeCount?: number | null;
          employeeCountRange?: string | null;
          annualRevenue?: string | number | null;
          revenueRange?: string | null;
          foundedYear?: number | null;
          fundingTotal?: string | number | null;
          fundingStage?: string | null;
          companyType?: string | null;
          technologies?: string[] | null;
          keywords?: string[] | null;
          website?: string | null;
          linkedinUrl?: string | null;
          twitterUrl?: string | null;
          facebookUrl?: string | null;
          instagramUrl?: string | null;
          youtubeUrl?: string | null;
          githubUrl?: string | null;
          crunchbaseUrl?: string | null;
          angellistUrl?: string | null;
          blogUrl?: string | null;
          phone?: string | null;
          contactEmail?: string | null;
          hqStreet?: string | null;
          hqCity?: string | null;
          hqRegion?: string | null;
          hqPostalCode?: string | null;
          hqCountry?: string | null;
          customFields?: unknown;
        } | null;
      }
    | null
    | undefined
  > | null;
  revenue?: string | null;
  companySize?: string | null;
};

type FormState = {
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phoneNumber: string;
  organization: string;
  jobTitle: string;
  state: string;
  website: string;
  revenue: string;
  companySize: string;
};

const emptyForm: FormState = {
  firstName: '',
  lastName: '',
  name: '',
  email: '',
  phoneNumber: '',
  organization: '',
  jobTitle: '',
  state: '',
  website: '',
  revenue: '',
  companySize: ''
};

function toForm(c: ContactPayload | null | undefined): FormState {
  if (!c) return emptyForm;
  return {
    firstName: c.firstName ?? '',
    lastName: c.lastName ?? '',
    name: c.name ?? '',
    email: c.email ?? '',
    phoneNumber: c.phoneNumber ?? '',
    organization: c.organization ?? c.company ?? '',
    jobTitle: c.jobTitle ?? '',
    state: c.locationRegion ?? '',
    website: c.websiteUrl ?? '',
    revenue: c.revenue ?? '',
    companySize: c.companySize ?? ''
  };
}

export function InCallContactInfo({ contactId }: { contactId: string }) {
  const api = useApi();
  const format = useFormatter();
  const t = useTranslations('calls.inCallContact');
  const tDetail = useTranslations('contacts.detail');
  const tContactActions = useTranslations('contacts.rowActions');
  const [contact, setContact] = useState<ContactPayload | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  function formatCompanyAmount(value: string | number | null | undefined) {
    if (value == null || (typeof value === 'string' && !value.trim()))
      return null;
    const cents = Number(value);
    return Number.isFinite(cents)
      ? format.number(cents / 100, { style: 'currency', currency: 'USD' })
      : null;
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setContact(null);
    setEditing(false);
    api
      .get<ContactPayload | null | undefined>(`/contacts/${contactId}`)
      .then((c) => {
        if (!active) return;
        setContact(c ?? null);
        setForm(toForm(c));
      })
      .catch(() => {
        if (active) {
          setContact(null);
          toast.error(t('loadFailed'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, contactId, t]);

  const setField = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSave() {
    if (!form.phoneNumber || form.phoneNumber.length < 5) {
      toast.error(t('phoneRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        name:
          form.name ||
          [form.firstName, form.lastName].filter(Boolean).join(' ') ||
          undefined
      };
      const updated = await api.put<ContactPayload | null | undefined>(
        `/contacts/${contactId}`,
        payload
      );
      if (!updated) {
        toast.error(t('saveFailed'));
        return;
      }
      setContact((current) => ({
        ...(current ?? {}),
        ...updated,
        affiliations: updated.affiliations ?? current?.affiliations
      }));
      setForm(toForm({ ...contact, ...updated }));
      setEditing(false);
      toast.success(t('updated'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setForm(toForm(contact));
    setEditing(false);
  }

  if (loading) {
    return (
      <div className='space-y-3 p-4 md:p-6'>
        <Skeleton className='h-6 w-40' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className='flex h-full flex-col items-center justify-center p-6 text-center'>
        <UserCircle2 className='text-muted-foreground mb-2 h-8 w-8' />
        <p className='text-muted-foreground text-sm'>{t('notFound')}</p>
      </div>
    );
  }

  const displayName =
    contact.name ||
    contact.fullName ||
    [contact.firstName, contact.middleName, contact.lastName]
      .filter(Boolean)
      .join(' ') ||
    contact.phoneNumber ||
    tDetail('contactInformation');
  const primaryCompany =
    contact.affiliations?.find(
      (affiliation) => affiliation?.isPrimary && affiliation.company
    )?.company ??
    contact.affiliations?.find((affiliation) => affiliation?.company)?.company;
  const externalLinkLabels: ExternalProfileLabels = {
    group: tContactActions('linksGroup'),
    linkedinProfile: tContactActions('linkedinProfile'),
    linkedinCompany: tContactActions('linkedinCompany'),
    website: tContactActions('website')
  };

  return (
    <ScrollArea className='h-full'>
      <div className='flex flex-col gap-4 p-4 md:p-6'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0 flex-1'>
            <h3 className='text-base font-bold break-words md:text-lg'>
              {displayName}
            </h3>
            <p className='text-muted-foreground text-xs break-words'>
              {contact.phoneNumber}
            </p>
          </div>
          {editing ? (
            <div className='flex gap-1'>
              <Button
                size='sm'
                variant='ghost'
                onClick={handleCancel}
                disabled={saving}
              >
                <X className='mr-1 h-4 w-4' />
                {t('cancel')}
              </Button>
              <Button size='sm' onClick={handleSave} disabled={saving}>
                <Check className='mr-1 h-4 w-4' />
                {saving ? t('saving') : t('save')}
              </Button>
            </div>
          ) : (
            <Button
              size='sm'
              variant='outline'
              onClick={() => setEditing(true)}
            >
              <Pencil className='mr-1 h-4 w-4' />
              {t('edit')}
            </Button>
          )}
        </div>

        <ExternalProfileButtons
          urls={{
            linkedinUrl: contact.linkedinUrl,
            companyLinkedinUrl: primaryCompany?.linkedinUrl,
            websiteUrl: contact.websiteUrl
          }}
          labels={externalLinkLabels}
        />

        {editing ? (
          <>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <Field
                label={t('firstName')}
                value={form.firstName}
                onChange={setField('firstName')}
                disabled={!editing}
              />
              <Field
                label={t('lastName')}
                value={form.lastName}
                onChange={setField('lastName')}
                disabled={!editing}
              />
            </div>

            <Field
              label={t('displayName')}
              value={form.name}
              onChange={setField('name')}
              disabled={!editing}
              placeholder={t('displayNamePlaceholder')}
            />

            <Field
              label={t('email')}
              value={form.email}
              onChange={setField('email')}
              disabled={!editing}
              type='email'
            />

            <Field
              label={t('phone')}
              value={form.phoneNumber}
              onChange={setField('phoneNumber')}
              disabled={!editing}
            />

            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <Field
                label={t('company')}
                value={form.organization}
                onChange={setField('organization')}
                disabled={!editing}
              />
              <Field
                label={t('jobTitle')}
                value={form.jobTitle}
                onChange={setField('jobTitle')}
                disabled={!editing}
              />
            </div>

            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <Field
                label={t('state')}
                value={form.state}
                onChange={setField('state')}
                disabled={!editing}
              />
              <Field
                label={t('website')}
                value={form.website}
                onChange={setField('website')}
                disabled={!editing}
              />
            </div>

            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <Field
                label={t('revenue')}
                value={form.revenue}
                onChange={setField('revenue')}
                disabled={!editing}
              />
              <Field
                label={t('companySize')}
                value={form.companySize}
                onChange={setField('companySize')}
                disabled={!editing}
              />
            </div>
          </>
        ) : (
          <ContactDetails
            title={tDetail('contactInformation')}
            rows={[
              [t('firstName'), contact.firstName],
              [t('middleName'), contact.middleName],
              [t('lastName'), contact.lastName],
              [t('fullName'), contact.fullName],
              [t('email'), contact.email],
              [t('phone'), contact.phoneNumber],
              [t('company'), contact.organization || contact.company],
              [t('jobTitle'), contact.jobTitle],
              [t('website'), contact.websiteUrl],
              [t('revenue'), contact.revenue],
              [t('companySize'), contact.companySize]
            ]}
          />
        )}

        <ContactDetails
          title={t('additionalFields')}
          rows={detailRows(contact.customFields)}
        />
        <ContactDetails
          title={tDetail('professional')}
          rows={[
            [t('headline'), contact.headline],
            [t('summary'), contact.summary],
            [tDetail('seniority'), contact.seniority],
            [tDetail('department'), contact.department],
            [tDetail('yearsOfExperience'), contact.yearsExperience],
            [tDetail('skills'), contact.skills],
            [tDetail('languages'), contact.languages],
            [tDetail('interests'), contact.interests],
            [t('education'), contact.education],
            [t('workHistory'), contact.workHistory]
          ]}
        />
        <ContactDetails
          title={tDetail('location')}
          rows={[
            [t('city'), contact.locationCity],
            [t('state'), contact.locationRegion],
            [t('country'), contact.locationCountry],
            [t('countryCode'), contact.locationCountryCode],
            [t('postalCode'), contact.locationPostalCode],
            [tDetail('timezone'), contact.timezone]
          ]}
        />
        <ContactDetails
          title={tDetail('socialProfiles')}
          rows={[
            ['LinkedIn', contact.linkedinUrl],
            ['Twitter / X', contact.twitterUrl],
            ['GitHub', contact.githubUrl],
            ['Facebook', contact.facebookUrl],
            ['Instagram', contact.instagramUrl],
            ['YouTube', contact.youtubeUrl],
            ['TikTok', contact.tiktokUrl],
            [t('blog'), contact.blogUrl],
            ['Calendly', contact.calendlyUrl]
          ]}
        />
        <ContactDetails
          title={tDetail('phoneNumbers')}
          rows={
            contact.phones?.map((phone) => [
              phone?.type || t('phone'),
              phone?.phone
            ]) ?? []
          }
        />
        <ContactDetails
          title={tDetail('emailAddresses')}
          rows={
            contact.emails?.map((email) => [
              email?.type || t('email'),
              email?.email
            ]) ?? []
          }
        />
        {contact.affiliations?.map((affiliation, index) => {
          const company = affiliation?.company;
          if (!company) return null;
          return (
            <ContactDetails
              key={affiliation?.id ?? index}
              title={company.name || t('company')}
              rows={[
                [t('company'), company.name],
                [t('jobTitle'), affiliation?.role],
                [t('summary'), company.description || company.shortDescription],
                [t('industry'), company.industry],
                [t('subIndustry'), company.subIndustry],
                [t('companyType'), company.companyType],
                [t('companySize'), company.employeeCountRange || company.size],
                [t('employees'), company.employeeCount],
                [
                  t('annualRevenue'),
                  company.annualRevenue != null
                    ? formatCompanyAmount(company.annualRevenue)
                    : company.revenueRange
                ],
                [t('foundedYear'), company.foundedYear],
                [t('fundingTotal'), formatCompanyAmount(company.fundingTotal)],
                [t('fundingStage'), company.fundingStage],
                [t('technologies'), company.technologies],
                [t('keywords'), company.keywords],
                [t('website'), company.website || company.domain],
                ['LinkedIn', company.linkedinUrl],
                ['Twitter / X', company.twitterUrl],
                ['Facebook', company.facebookUrl],
                ['Instagram', company.instagramUrl],
                ['YouTube', company.youtubeUrl],
                ['GitHub', company.githubUrl],
                ['Crunchbase', company.crunchbaseUrl],
                ['AngelList', company.angellistUrl],
                [t('blog'), company.blogUrl],
                [t('phone'), company.phone],
                [t('email'), company.contactEmail],
                [t('address'), company.hqStreet],
                [
                  tDetail('location'),
                  [
                    company.hqCity,
                    company.hqRegion,
                    company.hqPostalCode,
                    company.hqCountry
                  ]
                    .filter(Boolean)
                    .join(', ')
                ],
                ...detailRows(company.customFields)
              ]}
            />
          );
        })}
        <ContactDetails
          title={t('leadDetails')}
          rows={[
            [tDetail('source'), contact.source],
            [t('status'), contact.status],
            [t('lifecycleStage'), contact.lifecycleStage],
            [t('score'), contact.score],
            [tDetail('tags'), contact.tags?.map((entry) => entry?.tag?.name)],
            [t('birthday'), contact.birthday?.split('T')[0]],
            [t('gender'), contact.gender],
            [t('maritalStatus'), contact.maritalStatus],
            [t('doNotCall'), contact.doNotCall],
            [t('unsubscribed'), contact.unsubscribed],
            [t('emailVerified'), contact.emailVerified],
            [t('phoneVerified'), contact.phoneVerified]
          ]}
        />
        <ContactDetails
          title={tDetail('notes')}
          rows={
            contact.notes?.map((note) => [tDetail('notes'), note?.content]) ??
            []
          }
        />
      </div>
    </ScrollArea>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = 'text'
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
}) {
  const id = useId();
  return (
    <div className='min-w-0 space-y-1.5'>
      <Label
        htmlFor={id}
        className='text-muted-foreground text-xs tracking-wider uppercase'
      >
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        type={type}
      />
    </div>
  );
}

function hasDetailValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasDetailValue);
  if (typeof value === 'object')
    return Object.values(value).some(hasDetailValue);
  return true;
}

function detailRows(value: unknown): Array<[string, unknown]> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value);
  }
  return [];
}

function DetailValue({ value }: { value: unknown }) {
  const t = useTranslations('common');
  if (typeof value === 'boolean') return <>{t(value ? 'yes' : 'no')}</>;
  if (Array.isArray(value)) {
    const items = value.filter(hasDetailValue);
    return (
      <ul className='space-y-1'>
        {items.map((item, index) => (
          <li key={index}>
            <DetailValue value={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (value && typeof value === 'object') {
    return (
      <dl className='space-y-1 border-l pl-3'>
        {Object.entries(value)
          .filter(([, entry]) => hasDetailValue(entry))
          .map(([key, entry]) => (
            <div key={key}>
              <dt className='text-muted-foreground text-xs'>{key}</dt>
              <dd>
                <DetailValue value={entry} />
              </dd>
            </div>
          ))}
      </dl>
    );
  }
  return <>{value == null ? '' : String(value)}</>;
}

function ContactDetails({
  title,
  rows
}: {
  title: string;
  rows: Array<[string, unknown]>;
}) {
  const populated = rows.filter(([, value]) => hasDetailValue(value));
  if (populated.length === 0) return null;
  return (
    <section className='min-w-0 space-y-3 border-t pt-4'>
      <h4 className='text-sm font-semibold break-words'>{title}</h4>
      <dl className='grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2'>
        {populated.map(([label, value], index) => (
          <div
            key={`${label}-${index}`}
            className={
              typeof value === 'object' ||
              (typeof value === 'string' && value.length > 120)
                ? 'min-w-0 sm:col-span-2'
                : 'min-w-0'
            }
          >
            <dt className='text-muted-foreground mb-1 text-xs break-words'>
              {label}
            </dt>
            <dd className='text-sm [overflow-wrap:anywhere] whitespace-pre-wrap'>
              <DetailValue value={value} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
