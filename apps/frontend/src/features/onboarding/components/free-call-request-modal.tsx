'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { Gift, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useTranslations } from 'next-intl';
import { useFreeCallRequestStore } from '../store/free-call-request.store';
import { useOnboarding } from '../hooks/use.onboarding';

/** sessionStorage key so the auto-popup shows at most once per browser session. */
const SHOWN_KEY = 'ringee:free-call-request-shown';

interface FreeTrialRequestState {
  hasRequested: boolean;
  status: string | null;
}

/**
 * Modal where a freshly signed-up user requests a free call to try Ringee. The
 * request is reviewed manually by the team (an email is sent on submit) and can
 * only be made once. It auto-opens on first load after signup and can also be
 * reopened from the onboarding guide's first step.
 */
export function FreeCallRequestModal() {
  const t = useTranslations('onboarding.freeCallRequest');
  const api = useApi();
  const { completeStep } = useOnboarding();
  const { isOpen, open, close } = useFreeCallRequestStore();

  const [requested, setRequested] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const autoOpenChecked = useRef(false);

  // Load whether the user has already requested; auto-open once per session
  // for users who haven't.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data: FreeTrialRequestState = await api.get(
          '/free-trial/request'
        );
        if (cancelled) return;
        setRequested(data?.hasRequested ?? false);

        if (autoOpenChecked.current) return;
        autoOpenChecked.current = true;
        const alreadyShown =
          typeof window !== 'undefined' &&
          window.sessionStorage.getItem(SHOWN_KEY) === '1';
        if (!data?.hasRequested && !alreadyShown) {
          window.sessionStorage.setItem(SHOWN_KEY, '1');
          setTimeout(() => !cancelled && open(), 900);
        }
      } catch {
        // Non-critical: leave the modal dormant if the status can't be loaded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, open]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(false);
    try {
      await api.post('/free-trial/request', { note: note.trim() || undefined });
      setRequested(true);
      // Reflect completion in the onboarding guide (best-effort).
      completeStep('request_free_call').catch(() => {});
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const isSuccess = requested === true;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent className='overflow-hidden border-0 p-0 shadow-2xl sm:max-w-md'>
        {/* Decorative top gradient */}
        <div className='from-primary/15 pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b to-transparent' />

        <div className='relative z-10 p-6'>
          <DialogHeader className='mb-4 text-left'>
            <div className='flex items-center gap-3'>
              <motion.div
                key={isSuccess ? 'success-icon' : 'request-icon'}
                initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                className={
                  isSuccess
                    ? 'flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 shadow-sm ring-1 ring-emerald-500/20 dark:text-emerald-400'
                    : 'bg-primary/10 ring-primary/20 text-primary flex h-12 w-12 items-center justify-center rounded-xl shadow-sm ring-1'
                }
              >
                {isSuccess ? (
                  <CheckCircle2 className='h-6 w-6' />
                ) : (
                  <Gift className='h-6 w-6' />
                )}
              </motion.div>
              <div>
                <span
                  className={
                    isSuccess
                      ? 'text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400'
                      : 'text-primary text-xs font-semibold tracking-wide uppercase'
                  }
                >
                  {t('badge')}
                </span>
                <DialogTitle className='text-xl font-bold tracking-tight'>
                  {isSuccess ? t('successTitle') : t('title')}
                </DialogTitle>
              </div>
            </div>
          </DialogHeader>

          <AnimatePresence mode='wait'>
            {isSuccess ? (
              <motion.div
                key='success'
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <p className='text-muted-foreground text-sm leading-relaxed'>
                  {t('successDescription')}
                </p>
                <div className='mt-6 flex justify-end'>
                  <Button onClick={close} className='min-w-24'>
                    {t('done')}
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key='form'
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <p className='text-muted-foreground text-sm leading-relaxed'>
                  {t('description')}
                </p>

                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('notePlaceholder')}
                  maxLength={2000}
                  rows={3}
                  className='mt-4 resize-none'
                  disabled={submitting}
                />

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className='mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2'
                  >
                    <p className='text-sm font-medium text-red-600 dark:text-red-400'>
                      {t('errorTitle')}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {t('errorDescription')}
                    </p>
                  </motion.div>
                )}

                <div className='mt-6 flex gap-3'>
                  <Button
                    variant='ghost'
                    className='text-muted-foreground hover:text-foreground flex-1'
                    onClick={close}
                    disabled={submitting}
                  >
                    {t('dismiss')}
                  </Button>
                  <Button
                    className='h-11 flex-[2] cursor-pointer gap-2 text-base shadow-lg transition-all hover:scale-[1.02]'
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className='h-4 w-4 animate-spin' />
                        {t('submitting')}
                      </>
                    ) : (
                      <>
                        {t('submit')}
                        <ArrowRight className='h-4 w-4' />
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
