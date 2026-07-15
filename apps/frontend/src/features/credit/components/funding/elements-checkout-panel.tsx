'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe
} from '@stripe/react-stripe-js';
import {
  ArrowLeft,
  X,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  Lock,
  BadgeCheck
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useUser } from '@clerk/nextjs';
import { useTheme } from 'next-themes';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { getStripe, STRIPE_PUBLISHABLE_KEY } from '../../lib/stripe';
import {
  buildCheckoutAppearance,
  paymentElementOptions
} from './checkout-appearance';
import { paymentErrorMessage } from '../../lib/recharge';

const stripePromise = getStripe();

/** Discrete states the checkout panel moves through. */
type Phase = 'loading' | 'ready' | 'error' | 'completed';

export interface CreatedIntent {
  clientSecret: string;
  /** PaymentIntent id (payment flow) — null for SetupIntent / subscription. */
  intentId: string | null;
  /** Current billing email on file, used to prefill the editable field. */
  billingEmail: string | null;
}

interface Props {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  backLabel?: string;
  /** Back to the previous step (amount picker / hub). */
  onBack: () => void;
  /** Close the whole flow. */
  onClose: () => void;
  /** Create (or recreate) the Stripe intent for this flow. */
  createIntent: () => Promise<CreatedIntent>;
  /**
   * Recreate the intent whenever this changes. `setup_future_usage` is fixed at
   * PaymentIntent creation, so toggling the save-card consent bumps this key.
   */
  sessionKey?: string | number;
  /** `payment` → confirmPayment (top-up / subscription); `setup` → confirmSetup. */
  intentKind: 'payment' | 'setup';
  /** Primary button label, e.g. "Pay $25". */
  submitLabel: string;
  /** Right column: the Ringee funding summary. */
  summary: React.ReactNode;
  /** Optional block under the card form (save-card consent). */
  belowForm?: React.ReactNode;
  /** Show the editable "email for receipts / invoices" field. */
  showEmailField?: boolean;
  emailLabel?: string;
  emailHint?: string;
  /** Persist an edited billing email before confirming (no-op if unchanged). */
  persistEmail?: (email: string, intentId: string | null) => Promise<void>;
  /** Fired once Stripe confirms (client callback — verify server-side). */
  onComplete?: () => void;
  /** Rendered in the `completed` phase (success / reconcile view). */
  result: React.ReactNode;
  /**
   * Bubbles the "charge in flight" state up to the popover shell so it can hard-
   * block every dismissal (outside click, Esc, close) while Stripe is confirming.
   */
  onBusyChange?: (busy: boolean) => void;
}

/**
 * A Ringee-designed checkout panel that lives INSIDE the funding popover (the
 * popover grows to fit it), replacing Stripe's hosted embedded form. Two columns
 * — the custom card form (email + Stripe Elements + pay button) on the left, the
 * Ringee funding summary on the right — so the whole form is visible at a glance.
 * The popover shell owns dismissal (a live charge hard-guards it via
 * `onBusyChange`); here we only expose a back arrow and a close button. Used by
 * one-time top-up, monthly funding and card setup; each caller supplies its own
 * summary, consent and result view.
 */
export function ElementsCheckoutPanel({
  title,
  subtitle,
  badge,
  backLabel,
  onBack,
  onClose,
  createIntent,
  sessionKey,
  intentKind,
  submitLabel,
  summary,
  belowForm,
  showEmailField,
  emailLabel,
  emailHint,
  persistEmail,
  onComplete,
  result,
  onBusyChange
}: Props) {
  const t = useTranslations('billing.credits.popover');
  const { user } = useUser();
  const accountEmail = user?.primaryEmailAddress?.emailAddress ?? '';
  const { resolvedTheme } = useTheme();
  // Repaint the Stripe fields to match the app theme. Updating `options.appearance`
  // restyles the mounted Elements in place, so a theme toggle recolors them live.
  // Memoized so we only hand Stripe a new appearance when the theme flips.
  const appearance = useMemo(
    () => buildCheckoutAppearance(resolvedTheme === 'light' ? 'light' : 'dark'),
    [resolvedTheme]
  );

  const [phase, setPhase] = useState<Phase>('loading');
  const [creationError, setCreationError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [billingEmail, setBillingEmail] = useState<string | null>(null);
  const intentIdRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const missingKey = !STRIPE_PUBLISHABLE_KEY;

  // Mirror the charge-in-flight state to the popover shell so it can block
  // dismissal, and always release the lock when this panel unmounts.
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const create = useCallback(async () => {
    setPhase('loading');
    setCreationError(null);
    try {
      const {
        clientSecret: secret,
        intentId,
        billingEmail: email
      } = await createIntent();
      if (!secret) throw new Error('Missing client secret');
      intentIdRef.current = intentId;
      setBillingEmail(email);
      setClientSecret(secret);
      setPhase('ready');
    } catch (err) {
      console.error('Failed to create Stripe intent:', err);
      setCreationError(paymentErrorMessage(err, t('checkout.errorBody')));
      setPhase('error');
    }
  }, [createIntent, t]);

  // Create on mount and whenever the session key changes (consent toggle, etc.).
  useEffect(() => {
    if (missingKey) {
      setPhase('error');
      return;
    }
    create();
  }, [create, missingKey, sessionKey]);

  const handleSuccess = useCallback(() => {
    setPhase('completed');
    onComplete?.();
  }, [onComplete]);

  // Never let a dismissal (back / close button) discard a live charge.
  const requestBack = useCallback(() => {
    if (busy) return;
    onBack();
  }, [busy, onBack]);
  const requestClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const completed = phase === 'completed';

  return (
    <div className='flex max-h-[85vh] flex-col sm:max-h-[86vh]'>
      {/* Header */}
      <header className='border-border/60 bg-background/95 flex shrink-0 items-center gap-3 border-b px-5 py-4 backdrop-blur'>
        {!completed && (
          <button
            type='button'
            onClick={requestBack}
            disabled={busy}
            aria-label={backLabel ?? title}
            className={cn(
              'border-border/70 bg-muted/30 text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
              'hover:text-foreground hover:border-border cursor-pointer disabled:pointer-events-none disabled:opacity-40'
            )}
          >
            <ArrowLeft className='h-4 w-4' />
          </button>
        )}

        <div className='min-w-0 flex-1'>
          <h2 className='text-[15px] font-semibold tracking-tight'>{title}</h2>
          {subtitle && (
            <p className='text-muted-foreground truncate text-xs'>{subtitle}</p>
          )}
        </div>

        {badge && (
          <div className='border-border/70 bg-muted/40 shrink-0 rounded-full border px-3 py-1 text-sm font-semibold tabular-nums'>
            {badge}
          </div>
        )}

        <button
          type='button'
          onClick={requestClose}
          disabled={busy}
          aria-label={t('common.cancel')}
          className={cn(
            'text-muted-foreground ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
            'hover:text-foreground hover:bg-muted/40 cursor-pointer disabled:pointer-events-none disabled:opacity-40'
          )}
        >
          <X className='h-4 w-4' />
        </button>
      </header>

      {/* Body */}
      <div className='min-h-0 flex-1 overflow-y-auto'>
        {phase === 'loading' && (
          <div className='flex flex-col items-center justify-center gap-3 px-6 py-32 text-center'>
            <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
            <p className='text-muted-foreground text-sm'>
              {t('checkout.loading')}
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className='flex flex-col items-center justify-center gap-3 px-6 py-28 text-center'>
            <div className='flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10'>
              <AlertTriangle className='h-5 w-5 text-red-400' />
            </div>
            <p className='text-sm font-medium'>
              {missingKey
                ? t('checkout.missingKeyTitle')
                : t('checkout.errorTitle')}
            </p>
            <p className='text-muted-foreground max-w-[38ch] text-xs'>
              {missingKey
                ? t('checkout.missingKeyBody')
                : (creationError ?? t('checkout.errorBody'))}
            </p>
            {!missingKey && (
              <Button
                variant='outline'
                size='sm'
                onClick={create}
                className='mt-1 cursor-pointer'
              >
                {t('checkout.retry')}
              </Button>
            )}
          </div>
        )}

        {completed && result}

        {phase === 'ready' && clientSecret && (
          <div className='mx-auto grid w-full max-w-[960px] grid-cols-1 gap-6 p-5 lg:max-w-none lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] lg:gap-10 lg:p-10'>
            <div className='order-2 mx-auto w-full max-w-[560px] min-w-0 lg:order-1'>
              <Elements
                key={clientSecret}
                stripe={stripePromise}
                options={{ clientSecret, appearance }}
              >
                <CheckoutForm
                  intentKind={intentKind}
                  intentId={intentIdRef.current}
                  submitLabel={submitLabel}
                  belowForm={belowForm}
                  showEmailField={showEmailField}
                  emailLabel={emailLabel}
                  emailHint={emailHint}
                  initialEmail={billingEmail ?? accountEmail}
                  persistEmail={persistEmail}
                  onBusyChange={setBusy}
                  onSuccess={handleSuccess}
                />
              </Elements>
            </div>

            <div className='order-1 lg:order-2'>{summary}</div>
          </div>
        )}
      </div>
    </div>
  );
}

interface FormProps {
  intentKind: 'payment' | 'setup';
  intentId: string | null;
  submitLabel: string;
  belowForm?: React.ReactNode;
  showEmailField?: boolean;
  emailLabel?: string;
  emailHint?: string;
  initialEmail: string;
  persistEmail?: (email: string, intentId: string | null) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onSuccess: () => void;
}

/**
 * The card form itself — lives inside <Elements> so it can drive confirmation.
 * Owns the editable billing-email field, the Stripe PaymentElement, an inline
 * error and the pay button. Confirms with `redirect: 'if_required'` so cards
 * (incl. in-place 3-D Secure) complete without ever leaving Ringee.
 */
function CheckoutForm({
  intentKind,
  intentId,
  submitLabel,
  belowForm,
  showEmailField,
  emailLabel,
  emailHint,
  initialEmail,
  persistEmail,
  onBusyChange,
  onSuccess
}: FormProps) {
  const t = useTranslations('billing.credits.popover');
  const stripe = useStripe();
  const elements = useElements();

  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    onBusyChange(submitting);
  }, [submitting, onBusyChange]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stripe || !elements || inFlightRef.current) return;
      inFlightRef.current = true;
      setError(null);
      setSubmitting(true);

      try {
        // Elements was initialized WITH a clientSecret, so we confirm directly —
        // `confirmPayment`/`confirmSetup` validate the fields and surface any
        // error (no separate `elements.submit()`, which is the deferred flow).

        // Persist an edited billing email (customer email / receipt_email) so
        // the Stripe receipt goes where the user asked — before confirming.
        if (
          persistEmail &&
          email.trim() &&
          email.trim() !== initialEmail.trim()
        ) {
          try {
            await persistEmail(email.trim(), intentId);
          } catch (err) {
            console.error('Failed to update billing email:', err);
          }
        }

        const returnUrl = `${window.location.origin}/dashboard/overview?payment=return`;

        if (intentKind === 'payment') {
          const { error: confirmError, paymentIntent } =
            await stripe.confirmPayment({
              elements,
              confirmParams: { return_url: returnUrl },
              redirect: 'if_required'
            });
          if (confirmError) {
            setError(confirmError.message ?? t('checkout.errorBody'));
            return;
          }
          if (
            paymentIntent &&
            (paymentIntent.status === 'succeeded' ||
              paymentIntent.status === 'processing')
          ) {
            onSuccess();
            return;
          }
          setError(t('checkout.errorBody'));
        } else {
          const { error: confirmError, setupIntent } =
            await stripe.confirmSetup({
              elements,
              confirmParams: { return_url: returnUrl },
              redirect: 'if_required'
            });
          if (confirmError) {
            setError(confirmError.message ?? t('checkout.errorBody'));
            return;
          }
          if (setupIntent && setupIntent.status === 'succeeded') {
            onSuccess();
            return;
          }
          setError(t('checkout.errorBody'));
        }
      } catch (err) {
        console.error('Checkout confirmation failed:', err);
        setError(paymentErrorMessage(err, t('checkout.errorBody')));
      } finally {
        setSubmitting(false);
        inFlightRef.current = false;
      }
    },
    [
      stripe,
      elements,
      persistEmail,
      email,
      initialEmail,
      intentId,
      intentKind,
      onSuccess,
      t
    ]
  );

  return (
    <form onSubmit={handleSubmit} className='flex flex-col gap-5'>
      {showEmailField && (
        <div className='space-y-1.5'>
          <Label
            htmlFor='billing-email'
            className='text-muted-foreground text-xs font-medium'
          >
            {emailLabel ?? t('checkout.emailLabel')}
          </Label>
          {/* Styled to sit next to the Stripe card fields as one system: same
              radius, height, padding, and teal focus ring — in light and dark. */}
          <Input
            id='billing-email'
            type='email'
            inputMode='email'
            autoComplete='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('checkout.emailPlaceholder')}
            className={cn(
              'h-11 rounded-[10px] px-3 text-[15px] shadow-sm dark:shadow-none',
              'border-black/10 bg-white dark:border-white/10 dark:bg-[#17171b]',
              'focus-visible:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-500/40'
            )}
          />
          <p className='text-muted-foreground/70 text-[11px] leading-snug'>
            {emailHint ?? t('checkout.emailHint')}
          </p>
        </div>
      )}

      <PaymentElement options={paymentElementOptions} />

      {belowForm}

      {error && (
        <div className='flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300'>
          <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          <span>{error}</span>
        </div>
      )}

      <Button
        type='submit'
        size='lg'
        disabled={!stripe || submitting}
        className={cn(
          'w-full font-semibold transition-all duration-300',
          'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-black',
          'cursor-pointer shadow-[0_0_15px_-4px_rgba(45,212,191,0.5)] hover:brightness-110'
        )}
      >
        {submitting ? (
          <span className='flex items-center gap-2'>
            <Loader2 className='h-4 w-4 animate-spin' />
            {t('checkout.processing')}
          </span>
        ) : (
          submitLabel
        )}
      </Button>

      <div className='text-muted-foreground/80 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px]'>
        <span className='flex items-center gap-1.5'>
          <ShieldCheck className='h-3.5 w-3.5 text-emerald-400' />
          {t('footer.secureByStripe')}
        </span>
        <span className='flex items-center gap-1.5'>
          <Lock className='h-3.5 w-3.5' />
          {t('footer.cardSafety')}
        </span>
        <span className='flex items-center gap-1.5'>
          <BadgeCheck className='h-3.5 w-3.5' />
          {t('footer.creditsAfter')}
        </span>
      </div>
    </form>
  );
}
