'use client';
import { AlertModal } from '@ringee/frontend-shared/components/modal/alert-modal';
import {
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import { CreateNoteModal } from '@/features/contact/components/create.note.modal';
import { ManageContactTagsModal } from '@/features/contact/components/manage-contact-tags-popover';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  IconEdit,
  IconTrash,
  IconPhoneCall,
  IconPlus,
  IconTag,
  IconEye
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ExternalProfileMenuItems,
  hasExternalProfileLinks,
  type ExternalProfileLabels
} from '@ringee/frontend-shared/components/external-profile-links';
import { useQuickDialerCall } from '@/features/calls/hooks/use.quick.dialer.call';

interface CellActionProps {
  data: {
    id: string;
    name: string;
    organization: string;
    email: string;
    phoneNumber: string;
    linkedinUrl?: string | null;
    websiteUrl?: string | null;
    affiliations?: Array<{
      isPrimary: boolean;
      company: { linkedinUrl?: string | null };
    }>;
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
  const tCommon = useTranslations('common');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const api = useApi();
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const { handleRecall } = useQuickDialerCall();

  const externalLinkLabels: ExternalProfileLabels = {
    group: t('linksGroup'),
    linkedinProfile: t('linkedinProfile'),
    linkedinCompany: t('linkedinCompany'),
    website: t('website')
  };
  const companyLinkedinUrl = data.affiliations?.[0]?.company.linkedinUrl;
  const externalProfileUrls = {
    linkedinUrl: data.linkedinUrl,
    companyLinkedinUrl,
    websiteUrl: data.websiteUrl
  };

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
      <TableRowActions label={tCommon('openActions')} menuLabel={t('menu')}>
        <DropdownMenuItem
          onClick={() => router.push(`/dashboard/contact/${data.id}`)}
        >
          <IconEye className='mr-2 h-4 w-4' /> {t('view')}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handleRecall(data.phoneNumber)}>
          <IconPhoneCall className='mr-2 h-4 w-4' /> {t('call')}
        </DropdownMenuItem>

        <ExternalProfileMenuItems
          urls={externalProfileUrls}
          labels={externalLinkLabels}
        />
        {hasExternalProfileLinks(externalProfileUrls) ? (
          <DropdownMenuSeparator />
        ) : null}

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

        <DropdownMenuSeparator />
        <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
          <IconTrash className='mr-2 h-4 w-4' /> {t('delete')}
        </DropdownMenuItem>
      </TableRowActions>
    </>
  );
};
