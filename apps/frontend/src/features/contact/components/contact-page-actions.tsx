'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Button,
  buttonVariants
} from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconPlus, IconUpload, IconTag } from '@tabler/icons-react';
import { ImportCsvModal } from './import-csv-modal';
import { EditTagsModal } from './edit-tags-modal';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function ContactPageActions() {
  const router = useRouter();
  const t = useTranslations('contacts.pageActions');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);

  return (
    <>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setTagsModalOpen(true)}
        >
          <IconTag className='h-4 w-4 sm:mr-2' />
          <span className='hidden sm:inline'>{t('manageTags')}</span>
        </Button>

        <Button
          size='sm'
          variant='outline'
          onClick={() => setImportModalOpen(true)}
        >
          <IconUpload className='h-4 w-4 sm:mr-2' />
          <span className='hidden sm:inline'>{t('importCsv')}</span>
        </Button>

        <Link
          href='/dashboard/contact/new'
          className={cn(buttonVariants({ size: 'sm' }), 'text-xs md:text-sm')}
        >
          <IconPlus className='h-4 w-4 sm:mr-2' />
          <span className='hidden sm:inline'>{t('addContact')}</span>
        </Link>
      </div>

      <ImportCsvModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
      />

      <EditTagsModal
        open={tagsModalOpen}
        onOpenChange={setTagsModalOpen}
        onTagsUpdated={() => router.refresh()}
      />
    </>
  );
}
