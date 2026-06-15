'use client';

import { useTranslations } from 'next-intl';
import {
  IconAddressBook,
  IconFileText,
  IconForms,
  IconLoader2,
  IconShieldCheck
} from '@tabler/icons-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';

/** A regulatory requirement attached to a number, as returned by the API. */
export interface PurchaseRequirement {
  id: string;
  name: string;
  description?: string;
  fieldType: 'textual' | 'document' | 'address' | string;
}

const KNOWN_FIELD_TYPES = new Set(['textual', 'document', 'address']);

function iconForFieldType(fieldType: string) {
  if (fieldType === 'document') return IconFileText;
  if (fieldType === 'address') return IconAddressBook;
  return IconForms;
}

/**
 * Confirmation modal shown before checkout when a number requires regulatory
 * documentation. Lists everything the user will need to provide after purchase
 * and lets them continue to Stripe or cancel. Numbers with no requirements skip
 * this modal entirely (handled by the caller).
 */
export function PurchaseConfirmModal({
  open,
  onOpenChange,
  phoneNumber,
  countryCode,
  requirements,
  confirming,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumber: string;
  countryCode: string;
  requirements: PurchaseRequirement[];
  confirming: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations('settings.numbers.buy.purchase');
  const tf = useTranslations('settings.numbers.verify.fieldType');

  const fieldTypeLabel = (fieldType: string) =>
    KNOWN_FIELD_TYPES.has(fieldType) ? tf(fieldType as never) : fieldType;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <div className='bg-primary/10 text-primary mb-2 flex h-11 w-11 items-center justify-center rounded-full'>
            <IconShieldCheck className='h-6 w-6' />
          </div>
          <DialogTitle className='text-xl'>
            {t('requirementsTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('requirementsDescription', {
              phone: phoneNumber,
              country: countryCode.toUpperCase()
            })}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className='-mr-2 max-h-[55vh] pr-2'>
          <ul className='space-y-3'>
            {requirements.map((r) => {
              const Icon = iconForFieldType(r.fieldType);
              return (
                <li
                  key={r.id}
                  className='bg-muted/40 flex items-start gap-3 rounded-lg border p-4'
                >
                  <div className='bg-background text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-md border'>
                    <Icon className='h-5 w-5' />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-start justify-between gap-2'>
                      <p className='text-sm font-semibold'>{r.name}</p>
                      <Badge variant='outline' className='shrink-0 capitalize'>
                        {fieldTypeLabel(r.fieldType)}
                      </Badge>
                    </div>
                    {r.description && (
                      <p className='text-muted-foreground mt-1 text-sm'>
                        {r.description}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        <p className='text-muted-foreground text-xs'>{t('requirementsNote')}</p>

        <DialogFooter className='gap-2 sm:gap-2'>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            {t('cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={confirming}>
            {confirming && (
              <IconLoader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            {t('continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
