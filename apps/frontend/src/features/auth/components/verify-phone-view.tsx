'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SignOutButton, useUser } from '@clerk/nextjs';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconHeadset,
  IconLoader2,
  IconLock,
  IconMessageCircle,
  IconPhone,
  IconRefresh,
  IconShieldCheck
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import PhoneInput, {
  type Value as PhoneValue,
  isValidPhoneNumber
} from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { toast } from 'sonner';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot
} from '@ringee/frontend-shared/components/ui/input-otp';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { isValidCrispWebsiteId } from '@ringee/frontend-shared/components/crisp-chat';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import AuthPageShell from './auth-page-shell';
import type { PhoneAccessRequirements } from '../lib/phone-verification';

const ACCESS_POLL_INTERVAL_MS = 8_000;
const RESEND_COOLDOWN_SECONDS = 30;

type VerifiablePhone = {
  phoneNumber: string;
  verification: { status: string | null };
  prepareVerification: () => Promise<VerifiablePhone>;
  attemptVerification: (params: { code: string }) => Promise<VerifiablePhone>;
  destroy: () => Promise<void>;
};

function getErrorMessage(error: unknown, fallback: string): string {
  const errors = (
    error as {
      errors?: Array<{ longMessage?: string; message?: string }>;
    }
  )?.errors;

  return errors?.[0]?.longMessage ?? errors?.[0]?.message ?? fallback;
}

export default function VerifyPhoneView() {
  const t = useTranslations('auth');
  const router = useRouter();
  const api = useApi();
  const { isLoaded, user } = useUser();
  const [phone, setPhone] = useState<PhoneValue | undefined>();
  const [pendingPhone, setPendingPhone] = useState<VerifiablePhone | null>(
    null
  );
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(false);

  const continueToDashboard = useCallback(() => {
    router.replace('/dashboard/overview');
    router.refresh();
  }, [router]);

  const checkAccess = useCallback(
    async (showFeedback = false) => {
      setCheckingAccess(true);
      try {
        const requirements = await api.get<PhoneAccessRequirements>(
          '/user/access-requirements'
        );

        if (!requirements.phoneRequired || requirements.phoneVerified) {
          if (showFeedback) {
            toast.success(t('phoneVerification.accessApproved'));
          }
          continueToDashboard();
          return;
        }

        if (showFeedback) {
          toast.info(t('phoneVerification.accessStillRequired'));
        }
      } catch {
        if (showFeedback) {
          toast.error(t('phoneVerification.checkError'));
        }
      } finally {
        setCheckingAccess(false);
      }
    },
    [api, continueToDashboard, t]
  );

  useEffect(() => {
    if (user?.hasVerifiedPhoneNumber) {
      continueToDashboard();
    }
  }, [continueToDashboard, user?.hasVerifiedPhoneNumber, user?.updatedAt]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void checkAccess(false);
    }, ACCESS_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [checkAccess]);

  useEffect(() => {
    if (resendIn <= 0) return;

    const timeout = window.setTimeout(() => {
      setResendIn((seconds) => Math.max(0, seconds - 1));
    }, 1_000);

    return () => window.clearTimeout(timeout);
  }, [resendIn]);

  const sendVerificationCode = async () => {
    if (!user || !phone || !isValidPhoneNumber(phone)) {
      setFormError(t('phoneVerification.invalidPhone'));
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const existing = user.phoneNumbers.find(
        (candidate) => candidate.phoneNumber === phone
      );
      const phoneNumber =
        existing ?? (await user.createPhoneNumber({ phoneNumber: phone }));
      const prepared = await phoneNumber.prepareVerification();

      setPendingPhone(prepared);
      setCode('');
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      setFormError(
        getErrorMessage(error, t('phoneVerification.sendCodeError'))
      );
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async () => {
    if (!pendingPhone || code.length !== 6) {
      setFormError(t('phoneVerification.invalidCode'));
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const result = await pendingPhone.attemptVerification({ code });

      if (result.verification.status !== 'verified') {
        setFormError(t('phoneVerification.invalidCode'));
        return;
      }

      await user?.reload();
      toast.success(t('phoneVerification.verified'));
      continueToDashboard();
    } catch (error) {
      setFormError(
        getErrorMessage(error, t('phoneVerification.verifyCodeError'))
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (!pendingPhone || resendIn > 0) return;

    setResending(true);
    setFormError(null);

    try {
      const prepared = await pendingPhone.prepareVerification();
      setPendingPhone(prepared);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      toast.success(t('phoneVerification.codeResent'));
    } catch (error) {
      setFormError(
        getErrorMessage(error, t('phoneVerification.sendCodeError'))
      );
    } finally {
      setResending(false);
    }
  };

  const changePhoneNumber = async () => {
    const phoneToRemove = pendingPhone;

    setPendingPhone(null);
    setCode('');
    setFormError(null);
    setResendIn(0);

    try {
      await phoneToRemove?.destroy();
      await user?.reload();
    } catch {
      // The unverified number can be reused if Clerk already removed it or the
      // cleanup request fails. It should not block the user from trying again.
    }
  };

  const openSupportChat = () => {
    const email = user?.primaryEmailAddress?.emailAddress;
    const name = user?.fullName;
    const crispWebsiteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;

    if (isValidCrispWebsiteId(crispWebsiteId) && window.$crisp) {
      if (email) window.$crisp.push(['set', 'user:email', [email]]);
      if (name) window.$crisp.push(['set', 'user:nickname', [name]]);
      window.$crisp.push(['do', 'chat:open']);
      return;
    }

    window.location.href = `mailto:hello@ringee.io?subject=${encodeURIComponent(
      'Phone verification help'
    )}`;
  };

  const phoneIsValid = !!phone && isValidPhoneNumber(phone);

  return (
    <AuthPageShell
      quote={t('testimonial.quote')}
      author={t('testimonial.author')}
      contentClassName='max-w-md'
      mobileLogoClassName='mb-2'
    >
      <div className='w-full space-y-5 py-3'>
        <header className='space-y-3 text-center'>
          <div className='bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-2xl'>
            <IconShieldCheck className='size-6' stroke={1.8} />
          </div>
          <div className='space-y-1.5'>
            <p className='text-primary text-xs font-semibold tracking-widest uppercase'>
              {t('phoneVerification.stepLabel')}
            </p>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {pendingPhone
                ? t('phoneVerification.codeTitle')
                : t('phoneVerification.title')}
            </h1>
            <p className='text-muted-foreground mx-auto max-w-sm text-sm leading-6'>
              {pendingPhone
                ? t('phoneVerification.codeDescription', {
                    phone: pendingPhone.phoneNumber
                  })
                : t('phoneVerification.phoneDescription')}
            </p>
          </div>
        </header>

        <div className='border-border bg-card rounded-2xl border p-5 shadow-sm sm:p-6'>
          {!isLoaded || !user ? (
            <div className='flex min-h-44 items-center justify-center'>
              <IconLoader2 className='text-muted-foreground size-6 animate-spin' />
            </div>
          ) : pendingPhone ? (
            <form
              className='space-y-5'
              onSubmit={(event) => {
                event.preventDefault();
                void verifyCode();
              }}
            >
              <div className='space-y-3'>
                <Label htmlFor='phone-code'>
                  {t('phoneVerification.codeLabel')}
                </Label>
                <InputOTP
                  id='phone-code'
                  maxLength={6}
                  inputMode='numeric'
                  pattern='[0-9]*'
                  value={code}
                  onChange={(value) => {
                    setCode(value);
                    setFormError(null);
                  }}
                  disabled={submitting}
                  aria-invalid={!!formError}
                  containerClassName='justify-center'
                  autoFocus
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }, (_, index) => (
                      <InputOTPSlot
                        key={index}
                        index={index}
                        className='h-12 w-11 text-lg sm:w-12'
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {formError && (
                <p
                  className='text-destructive text-center text-sm'
                  role='alert'
                >
                  {formError}
                </p>
              )}

              <Button
                type='submit'
                size='lg'
                className='w-full gap-2'
                disabled={submitting || code.length !== 6}
              >
                {submitting ? (
                  <IconLoader2 className='size-4 animate-spin' />
                ) : (
                  <IconCheck className='size-4' />
                )}
                {t('phoneVerification.verifyButton')}
              </Button>

              <div className='flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm'>
                <Button
                  type='button'
                  variant='link'
                  size='sm'
                  className='text-muted-foreground h-auto gap-1 p-0'
                  onClick={() => void changePhoneNumber()}
                  disabled={submitting || resending}
                >
                  <IconArrowLeft className='size-3.5' />
                  {t('phoneVerification.changeNumber')}
                </Button>
                <Button
                  type='button'
                  variant='link'
                  size='sm'
                  className='h-auto p-0'
                  onClick={() => void resendCode()}
                  disabled={submitting || resending || resendIn > 0}
                >
                  {resending && (
                    <IconLoader2 className='mr-1 size-3.5 animate-spin' />
                  )}
                  {resendIn > 0
                    ? t('phoneVerification.resendIn', { seconds: resendIn })
                    : t('phoneVerification.resendCode')}
                </Button>
              </div>
            </form>
          ) : (
            <form
              className='space-y-5'
              onSubmit={(event) => {
                event.preventDefault();
                void sendVerificationCode();
              }}
            >
              <div className='space-y-2'>
                <Label htmlFor='phone-number'>
                  {t('phoneVerification.phoneLabel')}
                </Label>
                <PhoneInput
                  id='phone-number'
                  international
                  defaultCountry='US'
                  countryCallingCodeEditable={false}
                  value={phone}
                  onChange={(value) => {
                    setPhone(value);
                    setFormError(null);
                  }}
                  disabled={submitting}
                  placeholder={t('phoneVerification.phonePlaceholder')}
                  className='border-input bg-background focus-within:border-primary focus-within:ring-primary/20 h-11 rounded-lg border px-3 text-sm transition focus-within:ring-4 [&_.PhoneInputCountry]:mr-3 [&_.PhoneInputInput]:h-full [&_.PhoneInputInput]:min-w-0 [&_.PhoneInputInput]:border-0 [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:outline-none'
                />
                <p className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                  <IconMessageCircle className='size-3.5 shrink-0' />
                  {t('phoneVerification.smsHint')}
                </p>
              </div>

              {formError && (
                <p className='text-destructive text-sm' role='alert'>
                  {formError}
                </p>
              )}

              <Button
                type='submit'
                size='lg'
                className='w-full gap-2'
                disabled={submitting || !phoneIsValid}
              >
                {submitting ? (
                  <IconLoader2 className='size-4 animate-spin' />
                ) : (
                  <IconPhone className='size-4' />
                )}
                {t('phoneVerification.sendCode')}
                {!submitting && <IconArrowRight className='size-4' />}
              </Button>

              <p className='text-muted-foreground flex items-center justify-center gap-1.5 text-center text-xs'>
                <IconLock className='size-3.5 shrink-0' />
                {t('phoneVerification.securityNote')}
              </p>
            </form>
          )}
        </div>

        <div className='border-border bg-muted/35 rounded-xl border p-4'>
          <div className='flex items-start gap-3'>
            <div className='bg-background text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg border'>
              <IconHeadset className='size-4.5' />
            </div>
            <div className='min-w-0 flex-1'>
              <p className='text-sm font-medium'>
                {t('phoneVerification.noSmsTitle')}
              </p>
              <p className='text-muted-foreground mt-1 text-xs leading-5'>
                {t('phoneVerification.noSmsDescription')}
              </p>
              <div className='mt-3 flex flex-wrap items-center gap-2'>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  className='gap-1.5'
                  onClick={openSupportChat}
                >
                  <IconHeadset className='size-3.5' />
                  {t('phoneVerification.openChat')}
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  className='text-muted-foreground gap-1.5'
                  disabled={checkingAccess}
                  onClick={() => void checkAccess(true)}
                >
                  <IconRefresh
                    className={`size-3.5 ${checkingAccess ? 'animate-spin' : ''}`}
                  />
                  {t('phoneVerification.checkAccess')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className='text-muted-foreground flex items-center justify-between gap-4 px-1 text-xs'>
          <span className='flex min-w-0 items-center gap-1.5'>
            <IconCheck className='text-primary size-3.5 shrink-0' />
            <span className='truncate'>
              {t('phoneVerification.accountLabel', {
                email:
                  user?.primaryEmailAddress?.emailAddress ??
                  t('phoneVerification.yourAccount')
              })}
            </span>
          </span>
          <SignOutButton redirectUrl='/auth/sign-in'>
            <button
              type='button'
              className='hover:text-foreground shrink-0 transition-colors'
            >
              {t('phoneVerification.signOut')}
            </button>
          </SignOutButton>
        </div>
      </div>
    </AuthPageShell>
  );
}
