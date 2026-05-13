'use client';

import { useTranslations } from 'next-intl';
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
import { ShieldAlert } from 'lucide-react';

interface DncWarningModalProps {
  open: boolean;
  phoneNumber: string | null;
  reason?: string | null;
  addedAt?: string | null;
  onCallAnyway: () => void;
  onCancel: () => void;
}

export function DncWarningModal({
  open,
  phoneNumber,
  reason,
  addedAt,
  onCallAnyway,
  onCancel
}: DncWarningModalProps) {
  const t = useTranslations('dialer.dnc');

  const formattedDate = addedAt
    ? new Date(addedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : null;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className='flex items-start gap-3'>
            <span className='bg-destructive/10 text-destructive flex h-10 w-10 shrink-0 items-center justify-center rounded-full'>
              <ShieldAlert className='h-5 w-5' />
            </span>
            <div className='space-y-1'>
              <AlertDialogTitle className='text-left'>
                {t('title')}
              </AlertDialogTitle>
              {phoneNumber ? (
                <p className='text-muted-foreground text-left font-mono text-sm'>
                  {phoneNumber}
                </p>
              ) : null}
            </div>
          </div>

          <AlertDialogDescription asChild>
            <div className='space-y-3 pt-2 text-left'>
              <p className='text-muted-foreground text-sm'>
                {t('description')}
              </p>

              {reason || formattedDate ? (
                <div className='bg-muted/50 space-y-1 rounded-md border px-3 py-2 text-xs'>
                  {reason ? (
                    <div>
                      <span className='text-foreground font-medium'>
                        {t('reasonLabel')}:
                      </span>{' '}
                      <span className='text-muted-foreground'>{reason}</span>
                    </div>
                  ) : null}
                  {formattedDate ? (
                    <div>
                      <span className='text-foreground font-medium'>
                        {t('addedLabel')}:
                      </span>{' '}
                      <span className='text-muted-foreground'>
                        {formattedDate}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <p className='text-muted-foreground text-xs italic'>
                {t('compliance')}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {t('doNotCall')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onCallAnyway}
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive/40'
          >
            {t('callAnyway')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
