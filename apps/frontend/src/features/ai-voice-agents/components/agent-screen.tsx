'use client';

import { useState, type ReactNode } from 'react';
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

/**
 * The surface an agent is created or edited on: a full-screen panel that rises
 * from the bottom of the page.
 *
 * It is driven by the route, not by a piece of component state — `/new` and
 * `/[id]` each render one — so the browser's back button, a shared link and the
 * panel's own Back button all mean the same thing, and a half-finished agent
 * survives a refresh of the page it was being written on.
 *
 * Configuring an agent is a long, scrolling job with a save at the end, so the
 * chrome is pinned: the way out sits top-left where a back control belongs, the
 * agent's identity and its live actions stay in view at the top, and the footer
 * — where "unsaved changes" lives — is part of the panel rather than a bar
 * stretched across the whole viewport.
 */
export function AgentScreen({
  title,
  subtitle,
  badge,
  actions,
  footer,
  onClose,
  /** When true, leaving asks first: the panel is the only copy of the draft. */
  confirmClose = false,
  children
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  confirmClose?: boolean;
  children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);

  const requestClose = () => {
    if (confirmClose) setConfirming(true);
    else onClose();
  };

  return (
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
                <span className='hidden sm:inline'>Back</span>
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
                    Configure this AI voice agent.
                  </DialogPrimitive.Description>
                )}
              </div>

              {actions ? (
                <div className='flex shrink-0 items-center gap-2'>
                  {actions}
                </div>
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              The changes you made here have not been saved yet. Leaving now
              discards them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className='rounded-lg'>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction className='rounded-lg' onClick={onClose}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogPrimitive.Root>
  );
}
