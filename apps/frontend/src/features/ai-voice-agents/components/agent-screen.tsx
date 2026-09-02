'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowLeft } from 'lucide-react';
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
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';

const AgentScreenCloseContext = createContext<(() => void) | null>(null);

type AgentScreenContentProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * The persistent full-screen panel an agent is created or edited on. The route
 * drives it, and the same Radix dialog stays mounted while its loading content
 * becomes the real form, so the enter animation only runs once.
 *
 * Configuring an agent is a long, scrolling job with a save at the end. Its
 * content owns the pinned chrome while this component owns navigation and the
 * unsaved-changes guard.
 */
export function AgentScreen({
  onClose,
  confirmClose = false,
  children
}: {
  onClose: () => void;
  confirmClose?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('aiVoiceAgents.detail');
  const [confirming, setConfirming] = useState(false);

  const requestClose = () => {
    if (confirmClose) setConfirming(true);
    else onClose();
  };

  return (
    <AgentScreenCloseContext.Provider value={requestClose}>
      <DialogPrimitive.Root
        open
        onOpenChange={(next) => {
          // Escape and the overlay both route through the same guard as Back.
          if (!next) requestClose();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className='data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40 backdrop-blur-sm' />

          <DialogPrimitive.Content
            className={cn(
              'bg-background fixed inset-0 z-50 flex flex-col',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
              'data-[state=closed]:duration-200 data-[state=open]:duration-300'
            )}
            // The panel owns a whole screen of form; closing is deliberate, so
            // clicking outside it or auto-focusing the first input is not.
            onPointerDownOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>

        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('leaveTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('leaveHint')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className='rounded-lg'>
                {t('keepEditing')}
              </AlertDialogCancel>
              <AlertDialogAction className='rounded-lg' onClick={onClose}>
                {t('discard')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogPrimitive.Root>
    </AgentScreenCloseContext.Provider>
  );
}

/** Header, scrolling body and optional footer rendered inside AgentScreen. */
export function AgentScreenContent({
  title,
  subtitle,
  badge,
  actions,
  footer,
  children
}: AgentScreenContentProps) {
  const t = useTranslations('aiVoiceAgents.detail');
  const tCommon = useTranslations('aiVoiceAgents.common');
  const requestClose = useContext(AgentScreenCloseContext);

  if (!requestClose) {
    throw new Error('AgentScreenContent must be rendered inside AgentScreen');
  }

  return (
    <>
      <header className='bg-background/95 sticky top-0 z-10 border-b backdrop-blur'>
        <div className='mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 md:px-6'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='-ml-2 shrink-0 rounded-lg'
            onClick={requestClose}
          >
            <ArrowLeft className='size-4' />
            <span className='hidden sm:inline'>{tCommon('back')}</span>
          </Button>

          <div className='min-w-0 flex-1'>
            <div className='flex min-w-0 items-center gap-2'>
              <DialogPrimitive.Title className='truncate text-base font-semibold'>
                {title}
              </DialogPrimitive.Title>
              {badge}
            </div>
            {subtitle ? (
              <DialogPrimitive.Description className='text-muted-foreground truncate text-xs'>
                {subtitle}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className='sr-only'>
                {t('configureDescription')}
              </DialogPrimitive.Description>
            )}
          </div>

          {actions ? (
            <div className='flex shrink-0 items-center gap-2'>{actions}</div>
          ) : null}
        </div>
      </header>

      <div className='flex-1 overflow-y-auto'>
        <div className='mx-auto w-full max-w-5xl px-4 py-6 md:px-6'>
          {children}
        </div>
      </div>

      {footer ? (
        <footer className='bg-background/95 border-t backdrop-blur'>
          <div className='mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 md:px-6'>
            {footer}
          </div>
        </footer>
      ) : null}
    </>
  );
}
