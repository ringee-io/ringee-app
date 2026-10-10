'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconPlus } from '@tabler/icons-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { CreateListDialog } from './create-list-dialog';

/** The one way to start a list — admins and members alike (LIST-002). */
export function NewListButton({ className }: { className?: string }) {
  const t = useTranslations('lists');
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size='sm' className={className} onClick={() => setOpen(true)}>
        <IconPlus className='size-4' />
        {t('newList')}
      </Button>
      <CreateListDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
