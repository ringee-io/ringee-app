'use client';

import { useState, useEffect, useCallback } from 'react';
import { IconLoader2, IconTag } from '@tabler/icons-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { toast } from 'sonner';
import { TagMultiSelect, Tag } from './tag-multi-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@ringee/frontend-shared/components/ui/dialog';
import { useTranslations } from 'next-intl';

interface ManageContactTagsModalProps {
  contactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTagsUpdated?: () => void;
}

export function ManageContactTagsModal({
  contactId,
  open,
  onOpenChange,
  onTagsUpdated
}: ManageContactTagsModalProps) {
  const api = useApi();
  const t = useTranslations('contacts.contactTags');
  const [loading, setLoading] = useState(false);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [initialTagIds, setInitialTagIds] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tagsData, contactTagsData] = await Promise.all([
        api.get<Tag[]>('/tags'),
        api.get<Tag[]>(`/contacts/${contactId}/tags`)
      ]);
      setAvailableTags(tagsData);
      const currentIds = contactTagsData.map((t) => t.id);
      setSelectedTagIds(currentIds);
      setInitialTagIds(currentIds);
    } catch (err) {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [api, contactId]);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, fetchData]);

  const handleSelectionChange = async (newTagIds: string[]) => {
    setSelectedTagIds(newTagIds);

    try {
      await api.post(`/contacts/${contactId}/tags`, { tagIds: newTagIds });
      onTagsUpdated?.();
    } catch (err: any) {
      toast.error(err.message || t('updateFailed'));
      setSelectedTagIds(initialTagIds);
    }
  };

  const handleCreateTag = async (name: string): Promise<Tag> => {
    const newTag = await api.post<Tag>('/tags', { name, color: '#3B82F6' });
    setAvailableTags((prev) => [...prev, newTag]);
    return newTag;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[340px]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <IconTag className='h-5 w-5' />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className='py-4'>
          {loading ? (
            <div className='flex items-center justify-center py-8'>
              <IconLoader2 className='h-6 w-6 animate-spin' />
            </div>
          ) : (
            <TagMultiSelect
              availableTags={availableTags}
              selectedTagIds={selectedTagIds}
              onSelectionChange={handleSelectionChange}
              onCreateTag={handleCreateTag}
              placeholder={t('placeholder')}
              showCreateOption={true}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
