'use client';
import { AlertModal } from '@ringee/frontend-shared/components/modal/alert-modal';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { CreateNoteModal } from '@/features/contact/components/create.note.modal';
import { ManageContactTagsModal } from '@/features/contact/components/manage-contact-tags-popover';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  IconEdit,
  IconDotsVertical,
  IconTrash,
  IconPhoneCall,
  IconPlus,
  IconTag,
  IconEye
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface CellActionProps {
  data: {
    id: string;
    name: string;
    organization: string;
    email: string;
    phoneNumber: string;
    lastCallAt: string;
    calls: {
      id: string;
      createdAt: string;
    }[];
    notes: {
      content: string;
    }[];
  };
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const t = useTranslations('contacts.rowActions');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const api = useApi();
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);

  const onConfirm = async () => {
    try {
      setLoading(true);
      await api.delete(`/contacts/${data.id}`);
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <CreateNoteModal
        open={noteModalOpen}
        onOpenChange={setNoteModalOpen}
        contactId={data.id}
        onSave={() => {
          router.refresh();
          setNoteModalOpen(false);
        }}
      />

      <ManageContactTagsModal
        contactId={data.id}
        open={tagsModalOpen}
        onOpenChange={setTagsModalOpen}
        onTagsUpdated={() => router.refresh()}
      />

      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        loading={loading}
      />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='h-8 w-8 p-0'>
            <span className='sr-only'>{t('openMenu')}</span>
            <IconDotsVertical className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuLabel>{t('menu')}</DropdownMenuLabel>

          <DropdownMenuItem
            onClick={() => router.push(`/dashboard/contact/${data.id}`)}
          >
            <IconEye className='mr-2 h-4 w-4' /> {t('view')}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() =>
              router.push(`/dashboard/call?phoneNumber=${data.phoneNumber}`)
            }
          >
            <IconPhoneCall className='mr-2 h-4 w-4' /> {t('call')}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setNoteModalOpen(true)}>
            <IconPlus className='mr-2 h-4 w-4' /> {t('addNote')}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setTagsModalOpen(true)}>
            <IconTag className='mr-2 h-4 w-4' /> {t('manageTags')}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => router.push(`/dashboard/contact/${data.id}/edit`)}
          >
            <IconEdit className='mr-2 h-4 w-4' /> {t('edit')}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setOpen(true)}>
            <IconTrash className='mr-2 h-4 w-4' /> {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
