'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PhoneOutgoing, ShoppingCart } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import { usePublicNumberPromptStore } from '../store/public-number-prompt.store';

/**
 * The one "you are calling from the public number" warning for the
 * dashboard, driven by `confirmPublicNumberCall()`.
 */
export function PublicNumberPromptDialog() {
  const t = useTranslations('calls.publicNumberPrompt');
  const router = useRouter();
  const prompt = usePublicNumberPromptStore((s) => s.prompt);
  const settle = usePublicNumberPromptStore((s) => s.settle);
  const callRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog
      open={prompt !== null}
      onOpenChange={(open) => !open && settle('cancel')}
    >
      <AlertDialogContent
        // The user already chose to call: Enter carries on with it. Cancel
        // is one Escape away.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          callRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <div className='flex items-start gap-3'>
            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400'>
              <PhoneOutgoing className='h-5 w-5' />
            </span>
            <div className='space-y-2 pt-1 text-left'>
              <AlertDialogTitle>{t('title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {prompt?.hasOwnNumbers
                  ? t('descriptionOwnNumbers')
                  : t('description')}
              </AlertDialogDescription>
              {prompt && !prompt.hasOwnNumbers ? (
                <button
                  type='button'
                  className='inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400'
                  onClick={() => {
                    settle('cancel');
                    router.push('/dashboard/buy-number');
                  }}
                >
                  <ShoppingCart className='h-3.5 w-3.5' />
                  {t('buyNumber')}
                </button>
              ) : null}
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogFooter>
          {/* Apart on the left, in the dialer's call green: the way on for
              someone who already knows. Enter stays on "Llamar", so a reflex
              press never silences the warning for good. */}
          <AlertDialogAction
            className='bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600/40 sm:mr-auto'
            onClick={() => settle('always')}
          >
            {t('callAndDontWarn')}
          </AlertDialogAction>
          <AlertDialogCancel onClick={() => settle('cancel')}>
            {t('cancel')}
          </AlertDialogCancel>
          <AlertDialogAction ref={callRef} onClick={() => settle('call')}>
            {t('call')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
