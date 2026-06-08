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
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { FinalTranscript } from '@/features/transcription';
import {
  IconEdit,
  IconDotsVertical,
  IconTrash,
  IconPhoneCall,
  IconPlus,
  IconFileText
} from '@tabler/icons-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuickDialerCall } from '@/features/calls/hooks/use.quick.dialer.call';

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
  const api = useApi();
  const router = useRouter();
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const { handleRecall } = useQuickDialerCall();

  const latestCallId = data.calls?.[0]?.id ?? null;

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

      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        loading={loading}
      />

      <Dialog open={transcriptOpen} onOpenChange={setTranscriptOpen}>
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle className='sr-only'>Transcript</DialogTitle>
          </DialogHeader>
          <div className='max-h-[70vh] overflow-y-auto'>
            <FinalTranscript callId={latestCallId} />
          </div>
        </DialogContent>
      </Dialog>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='h-8 w-8 p-0'>
            <span className='sr-only'>Open menu</span>
            <IconDotsVertical className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>

          <DropdownMenuItem
            onClick={() => handleRecall(data.phoneNumber)}
          >
            <IconPhoneCall className='mr-2 h-4 w-4' /> Call
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setNoteModalOpen(true)}>
            <IconPlus className='mr-2 h-4 w-4' /> Add Note
          </DropdownMenuItem>

          {latestCallId && (
            <DropdownMenuItem onClick={() => setTranscriptOpen(true)}>
              <IconFileText className='mr-2 h-4 w-4' /> Transcript
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={() => router.push(`/dashboard/contact/${data.id}`)}
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
