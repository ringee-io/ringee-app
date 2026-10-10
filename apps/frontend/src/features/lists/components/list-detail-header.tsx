'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  IconArrowLeft,
  IconDots,
  IconEdit,
  IconPlus,
  IconTrash,
  IconUpload
} from '@tabler/icons-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { describeApiError } from '@/features/ai-voice-agents/lib/api-error';
import type { ContactList } from '../types';
import { AddListContactDialog } from './add-list-contact-dialog';
import { AssigneeSelect } from './assignee-select';
import { DeleteListDialog, EditListDialog } from './edit-list-dialog';
import { ImportListCsvDialog } from './import-list-csv-dialog';
import { LocalDate, usePersonName } from './list-bits';

/**
 * What the list is, who works it and who made it, with the actions the
 * caller is allowed (the server decides them, LIST-002).
 */
export function ListDetailHeader({ list }: { list: ContactList }) {
  const t = useTranslations('lists');
  const api = useApi();
  const router = useRouter();
  const nameOf = usePersonName();
  const { permissions } = list;
  const [dialog, setDialog] = useState<
    'import' | 'add' | 'edit' | 'delete' | null
  >(null);
  const [reassigning, setReassigning] = useState(false);

  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  const reassign = async (memberId: string) => {
    if (memberId === list.assignedTo?.id) return;
    setReassigning(true);
    try {
      const updated = await api.patch<ContactList>(
        `/contact-lists/${list.id}`,
        { assignedToId: memberId }
      );
      toast.success(
        t('detail.reassigned', { name: nameOf(updated.assignedTo) })
      );
      router.refresh();
    } catch (error) {
      toast.error(describeApiError(error, t('detail.reassignFailed')));
    } finally {
      setReassigning(false);
    }
  };

  return (
    <div className='space-y-3'>
      <Link
        href='/dashboard/lists'
        className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm'
      >
        <IconArrowLeft className='size-4' />
        {t('detail.back')}
      </Link>

      <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0 space-y-1'>
          <h2 className='text-2xl font-bold tracking-tight break-words sm:text-3xl'>
            {list.name}
          </h2>
          {list.description ? (
            <p className='text-muted-foreground max-w-2xl text-sm whitespace-pre-line'>
              {list.description}
            </p>
          ) : null}
        </div>

        <div className='flex shrink-0 flex-wrap items-center gap-2'>
          {permissions.canAddContacts ? (
            <>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setDialog('import')}
              >
                <IconUpload className='size-4' />
                {t('detail.uploadCsv')}
              </Button>
              <Button size='sm' onClick={() => setDialog('add')}>
                <IconPlus className='size-4' />
                {t('detail.addContact')}
              </Button>
            </>
          ) : null}
          {permissions.canManage ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-8'
                  aria-label={t('detail.more')}
                >
                  <IconDots className='size-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onClick={() => setDialog('edit')}>
                  <IconEdit className='mr-2 size-4' />
                  {t('detail.edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() => setDialog('delete')}
                >
                  <IconTrash className='mr-2 size-4' />
                  {t('detail.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <div className='text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 text-sm'>
        <span className='text-foreground font-medium tabular-nums'>
          {t('detail.contactCount', { count: list.contactCount })}
        </span>
        {permissions.canAssign ? (
          <span className='flex items-center gap-2'>
            <span>{t('detail.assignedTo')}</span>
            <AssigneeSelect
              value={list.assignedTo?.id ?? ''}
              current={list.assignedTo}
              onChange={(memberId) => void reassign(memberId)}
              disabled={reassigning}
              className='h-8 w-52'
            />
          </span>
        ) : null}
        <span>
          {t('detail.createdBy', { name: nameOf(list.createdBy) })} ·{' '}
          <LocalDate value={list.createdAt} />
        </span>
      </div>

      {permissions.canAddContacts ? (
        <>
          <ImportListCsvDialog
            list={list}
            open={dialog === 'import'}
            onOpenChange={close}
          />
          <AddListContactDialog
            list={list}
            open={dialog === 'add'}
            onOpenChange={close}
          />
        </>
      ) : null}
      {permissions.canManage ? (
        <>
          <EditListDialog
            list={list}
            open={dialog === 'edit'}
            onOpenChange={close}
          />
          <DeleteListDialog
            list={list}
            open={dialog === 'delete'}
            onOpenChange={close}
            onDeleted={() => router.push('/dashboard/lists')}
          />
        </>
      ) : null}
    </div>
  );
}
