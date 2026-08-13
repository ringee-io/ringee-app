'use client';

import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';
import PhoneInput, {
  type Country,
  type Value as E164Number,
  getCountries,
  isValidPhoneNumber
} from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

import { cn } from '@ringee/frontend-shared/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

const NUMBER_OF_USERS_OPTIONS = [
  'Just me',
  '2–5',
  '6–20',
  '21–50',
  '51–200',
  '200+'
];

const REFERRAL_SOURCE_OPTIONS = [
  'Google or another search engine',
  'ChatGPT or another AI assistant',
  'GitHub / open source',
  'LinkedIn',
  'X (Twitter)',
  'Product Hunt',
  'A friend or colleague',
  'Other'
];

const schema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, { message: 'First name is required' })
    .max(100),
  lastName: z
    .string()
    .trim()
    .min(1, { message: 'Last name is required' })
    .max(100),
  email: z
    .string()
    .trim()
    .email({ message: 'Enter a valid work email' })
    .max(255),
  phoneNumber: z
    .string()
    .min(1, { message: 'Phone number is required' })
    .refine((value) => isValidPhoneNumber(value), {
      message: 'Enter a valid phone number for the selected country'
    }),
  companyWebsite: z
    .string()
    .trim()
    .max(255)
    .regex(/^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/i, {
      message: 'Enter a valid link, e.g. acme.com or linkedin.com/in/janedoe'
    }),
  numberOfUsers: z.string().min(1, { message: 'Select your team size' }),
  referralSource: z.string().min(1, { message: 'Tell us how you found us' }),
  // Honeypot — hidden from real users, only bots fill it.
  fax: z.string().max(255).optional()
});

type FormValues = z.infer<typeof schema>;

const inputClass =
  'border-border/80 bg-background placeholder:text-muted-foreground/70 h-12 w-full rounded-xl border px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none';

/**
 * PhoneInput renders a flag/country select plus an inner <input>, so the box
 * chrome lives on the container (focus-within instead of focus-visible) and
 * the inner input is stripped bare via arbitrary-variant selectors.
 */
const phoneInputClass =
  'border-border/80 bg-background h-12 w-full rounded-xl border px-4 text-sm transition-colors focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-2 focus-within:ring-offset-background ' +
  '[&_.PhoneInputInput]:h-full [&_.PhoneInputInput]:w-full [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:text-sm [&_.PhoneInputInput]:outline-none [&_.PhoneInputInput]:placeholder:text-muted-foreground/70';

const errorInputClass =
  'border-red-500/70 focus-visible:ring-red-500 focus-within:ring-red-500';

/**
 * Best-effort ISO 3166-1 alpha-2 country from the browser's language tags
 * (e.g. "es-DO" -> "DO"). Used to preselect the phone country and stored with
 * the request so the team knows where the visitor is calling from.
 */
function detectBrowserCountry(): Country | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const tags = [...(navigator.languages ?? []), navigator.language];
  for (const tag of tags) {
    if (!tag) continue;
    try {
      const region = new Intl.Locale(tag).maximize().region?.toUpperCase();
      if (region && (getCountries() as string[]).includes(region)) {
        return region as Country;
      }
    } catch {
      // Malformed language tag — try the next one.
    }
  }
  return undefined;
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <label htmlFor={htmlFor} className='text-sm font-medium'>
        {label}
      </label>
      {children}
      {error ? (
        <p role='alert' className='text-sm text-red-600 dark:text-red-400'>
          {error}
        </p>
      ) : hint ? (
        <p className='text-muted-foreground text-xs'>{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * The /request-demo form. Public — posts to the backend's unauthenticated
 * `POST /demo-requests` endpoint, which stores the request and emails both
 * the Ringee team and the requester. The team vets the profile and creates
 * the account directly — no meeting is scheduled.
 */
export function RequestDemoForm() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>(
    'idle'
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Detected after mount: `navigator` doesn't exist during SSR, and resolving
  // it in an effect keeps the server and first client render identical.
  const [detectedCountry, setDetectedCountry] = useState<Country | undefined>();
  useEffect(() => {
    setDetectedCountry(detectBrowserCountry());
  }, []);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      companyWebsite: '',
      numberOfUsers: '',
      referralSource: '',
      fax: ''
    }
  });

  const onSubmit = async (values: FormValues) => {
    setStatus('submitting');
    setSubmitError(null);
    try {
      const res = await fetch(`${API_URL}/demo-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, country: detectedCountry })
      });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      setStatus('success');
    } catch {
      setStatus('idle');
      setSubmitError(
        'Something went wrong sending your request. Please try again, or email us at edisonpadilla.dev@gmail.com.'
      );
    }
  };

  if (status === 'success') {
    return (
      <div className='flex flex-col items-center gap-4 py-10 text-center'>
        <span className='flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10'>
          <CheckCircle2
            className='h-8 w-8 text-emerald-600 dark:text-emerald-400'
            aria-hidden
          />
        </span>
        <h2 className='text-2xl font-bold tracking-tight'>Request received</h2>
        <p className='text-muted-foreground max-w-sm text-pretty'>
          Thanks — we&apos;re reviewing your details. Once approved, we&apos;ll
          set up your account and email you access, usually within one business
          day. No meeting needed. A confirmation email is on its way.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className='grid gap-5'>
      <div className='grid gap-5 sm:grid-cols-2'>
        <Field
          label='First name'
          htmlFor='demo-first-name'
          error={errors.firstName?.message}
        >
          <input
            id='demo-first-name'
            type='text'
            autoComplete='given-name'
            placeholder='Jane'
            className={cn(inputClass, errors.firstName && errorInputClass)}
            {...register('firstName')}
          />
        </Field>
        <Field
          label='Last name'
          htmlFor='demo-last-name'
          error={errors.lastName?.message}
        >
          <input
            id='demo-last-name'
            type='text'
            autoComplete='family-name'
            placeholder='Doe'
            className={cn(inputClass, errors.lastName && errorInputClass)}
            {...register('lastName')}
          />
        </Field>
      </div>

      <Field
        label='Work email'
        htmlFor='demo-email'
        error={errors.email?.message}
      >
        <input
          id='demo-email'
          type='email'
          autoComplete='email'
          placeholder='jane@acme.com'
          className={cn(inputClass, errors.email && errorInputClass)}
          {...register('email')}
        />
      </Field>

      <Field
        label='Phone number'
        htmlFor='demo-phone'
        error={errors.phoneNumber?.message}
      >
        <Controller
          name='phoneNumber'
          control={control}
          render={({ field }) => (
            <PhoneInput
              // Remount once detection resolves so the preselected country
              // updates; the controlled value survives the remount.
              key={detectedCountry ?? 'detecting'}
              id='demo-phone'
              international
              defaultCountry={detectedCountry}
              value={(field.value || undefined) as E164Number | undefined}
              onChange={(value) => field.onChange(value ?? '')}
              onBlur={field.onBlur}
              placeholder='Enter your phone number'
              className={cn(
                phoneInputClass,
                errors.phoneNumber && errorInputClass
              )}
            />
          )}
        />
      </Field>

      <Field
        label='Company website'
        htmlFor='demo-website'
        error={errors.companyWebsite?.message}
        hint='No website? Your LinkedIn or the social profile you use for work is fine too.'
      >
        <input
          id='demo-website'
          type='text'
          autoComplete='url'
          inputMode='url'
          placeholder='acme.com or linkedin.com/in/janedoe'
          className={cn(inputClass, errors.companyWebsite && errorInputClass)}
          {...register('companyWebsite')}
        />
      </Field>

      <div className='grid gap-5 sm:grid-cols-2'>
        <Field
          label='Number of users'
          htmlFor='demo-users'
          error={errors.numberOfUsers?.message}
        >
          <div className='relative'>
            <select
              id='demo-users'
              className={cn(
                inputClass,
                'appearance-none pr-10',
                errors.numberOfUsers && errorInputClass
              )}
              defaultValue=''
              {...register('numberOfUsers')}
            >
              <option value='' disabled>
                Select team size
              </option>
              {NUMBER_OF_USERS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown
              className='text-muted-foreground pointer-events-none absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2'
              aria-hidden
            />
          </div>
        </Field>
        <Field
          label='How did you find us?'
          htmlFor='demo-referral'
          error={errors.referralSource?.message}
        >
          <div className='relative'>
            <select
              id='demo-referral'
              className={cn(
                inputClass,
                'appearance-none pr-10',
                errors.referralSource && errorInputClass
              )}
              defaultValue=''
              {...register('referralSource')}
            >
              <option value='' disabled>
                Select an option
              </option>
              {REFERRAL_SOURCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown
              className='text-muted-foreground pointer-events-none absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2'
              aria-hidden
            />
          </div>
        </Field>
      </div>

      {/* Honeypot — visually hidden and skipped by keyboard/screen readers. */}
      <div
        aria-hidden
        className='absolute top-0 -left-[9999px] h-0 w-0 overflow-hidden'
      >
        <label htmlFor='demo-fax'>Fax</label>
        <input
          id='demo-fax'
          type='text'
          tabIndex={-1}
          autoComplete='off'
          {...register('fax')}
        />
      </div>

      {submitError ? (
        <p
          role='alert'
          className='rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400'
        >
          {submitError}
        </p>
      ) : null}

      <button
        type='submit'
        disabled={status === 'submitting'}
        className='focus-visible:ring-offset-background inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-700/20 transition-all hover:bg-emerald-700/90 hover:shadow-xl hover:shadow-emerald-700/30 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60'
      >
        {status === 'submitting' ? (
          <>
            <Loader2 className='h-4 w-4 animate-spin' aria-hidden />
            Sending…
          </>
        ) : (
          <>
            Request Demo
            <ArrowRight className='h-4 w-4' aria-hidden />
          </>
        )}
      </button>

      <p className='text-muted-foreground text-center text-xs text-pretty'>
        We review every request personally and only use these details to set up
        your account — no spam, no sharing with third parties.
      </p>
    </form>
  );
}
