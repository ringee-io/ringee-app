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
import { useQuickDialerCall } from '@/features/calls/hooks/use.quick.dialer.call';
import { CreateNoteModal } from '@/features/contact/components/create.note.modal';
import { ManageContactTagsModal } from '@/features/contact/components/manage-contact-tags-popover';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  IconEdit,
  IconDotsVertical,
  IconTrash,
  IconPhoneCall,
  IconPlus,
  IconTag
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const api = useApi();
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);

  const { handleRecall } = useQuickDialerCall();

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
            <span className='sr-only'>Open menu</span>
            <IconDotsVertical className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>

          <DropdownMenuItem onClick={() => handleRecall(data.phoneNumber)}>
            <IconPhoneCall className='mr-2 h-4 w-4' /> Call
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setNoteModalOpen(true)}>
            <IconPlus className='mr-2 h-4 w-4' /> Add Note
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setTagsModalOpen(true)}>
            <IconTag className='mr-2 h-4 w-4' /> Manage Tags
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => router.push(`/contacts/${data.id}`)}
          >
            <IconEdit className='mr-2 h-4 w-4' /> Update
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setOpen(true)}>
            <IconTrash className='mr-2 h-4 w-4' /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

