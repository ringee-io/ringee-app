'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Mic, Sparkles, X, ArrowRight } from 'lucide-react';
import { useOnboarding } from '../hooks/use.onboarding';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useTranslations } from 'next-intl';

/**
 * Modal that appears when the user hasn't made their first call yet.
 * Encourages them to make a call and shows them the recording button.
 */
export function FirstCallModal() {
  const t = useTranslations('onboarding.firstCallModal');
  const router = useRouter();
  const { status, isLoading, isStepComplete } = useOnboarding();
  const [isOpen, setIsOpen] = useState(false);
  const [hasDismissed, setHasDismissed] = useState(false);

  // Show modal when first_call step is not complete
  useEffect(() => {
    if (
      !isLoading &&
      status &&
      !isStepComplete('first_call') &&
      !hasDismissed
    ) {
      // Small delay to let the page load first
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, status, isStepComplete, hasDismissed]);

  const handleStartCall = () => {
    setIsOpen(false);
    router.push('/dashboard/call');
  };

  const handleDismiss = () => {
    setHasDismissed(true);
    setIsOpen(false);
  };

  // Don't render if loading or already completed
  if (isLoading || !status || isStepComplete('first_call')) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogContent className='bg-background/95 overflow-hidden border-0 p-0 shadow-2xl backdrop-blur-md sm:max-w-md md:max-w-[550px]'>
        {/* Decorative gradient background opacity */}
        <div className='from-primary/10 pointer-events-none absolute top-0 right-0 left-0 h-32 bg-gradient-to-b to-transparent' />

        <div className='relative z-10 p-6'>
          <DialogHeader className='mb-6 text-left'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-3'>
                <div className='bg-primary/10 ring-primary/20 flex h-12 w-12 items-center justify-center rounded-xl shadow-sm ring-1'>
                  <Sparkles className='text-primary h-6 w-6' />
                </div>
                <div>
                  <DialogTitle className='text-2xl font-bold tracking-tight'>
                    {t('title')}
                  </DialogTitle>
                  <p className='text-muted-foreground text-sm font-medium'>
                    {t('subtitle')}
                  </p>
                </div>
              </div>
              {/* <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full -mt-2 -mr-2 opacity-70 hover:opacity-100"
                onClick={handleDismiss}
              >
                <X className="h-4 w-4" />
              </Button> */}
            </div>
          </DialogHeader>

          <div className='space-y-6'>
            {/* Steps Container */}
            <div className='grid gap-4'>
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className='bg-muted/40 border-border/40 hover:bg-muted/60 flex items-start gap-4 rounded-xl border p-4 transition-colors'
              >
                <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 shadow-sm dark:bg-blue-500/20 dark:text-blue-400'>
                  <Phone className='h-5 w-5' />
                </div>
                <div>
                  <h4 className='mb-1 text-sm font-semibold'>
                    {t('step1Title')}
                  </h4>
                  <p className='text-muted-foreground text-xs leading-relaxed'>
                    {t('step1Description')}
                  </p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className='bg-muted/40 border-border/40 hover:bg-muted/60 flex items-start gap-4 rounded-xl border p-4 transition-colors'
              >
                <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 shadow-sm dark:bg-rose-500/20 dark:text-rose-400'>
                  <Mic className='h-5 w-5' />
                </div>
                <div>
                  <h4 className='mb-1 text-sm font-semibold'>
                    {t('step2Title')}
                  </h4>
                  <p className='text-muted-foreground text-xs leading-relaxed'>
                    {t('step2Description')}
                  </p>
                </div>
              </motion.div>
            </div>

            {/* Recording visual hint */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className='border-border group relative overflow-hidden rounded-xl border shadow-lg'
            >
              <div className='bg-background/95 border-border/50 absolute top-3 left-3 z-10 flex items-center gap-2 rounded-md border px-2.5 py-1.5 shadow-sm backdrop-blur'>
                <span className='relative flex h-2 w-2'>
                  <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75'></span>
                  <span className='relative inline-flex h-2 w-2 rounded-full bg-rose-500'></span>
                </span>
                <p className='text-foreground/80 text-[10px] font-semibold tracking-wider uppercase'>
                  {t('recordingButton')}
                </p>
              </div>

              {/* Overlay gradient for depth */}
              <div className='from-background/20 pointer-events-none absolute inset-0 bg-gradient-to-t to-transparent' />

              <Image
                src='/start-recording-cap.png'
                alt={t('recordingAlt')}
                width={550}
                height={300}
                className='h-auto w-full transform object-cover transition-transform duration-700 ease-out group-hover:scale-105'
                priority
              />
            </motion.div>

            {/* CTA buttons */}
            <div className='flex gap-3 pt-2'>
              <Button
                variant='ghost'
                className='text-muted-foreground hover:text-foreground flex-1'
                onClick={handleDismiss}
              >
                {t('maybeLater')}
              </Button>
              <Button
                className='shadow-primary/25 hover:shadow-primary/40 h-11 flex-[2] cursor-pointer gap-2 text-base shadow-lg transition-all hover:scale-[1.02]'
                onClick={handleStartCall}
              >
                {t('startCalling')}
                <ArrowRight className='h-4 w-4' />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
