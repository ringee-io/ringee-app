'use client';

import { useState, useEffect, useCallback } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import * as z from 'zod';

import { FormInput } from '@ringee/frontend-shared/components/forms/form-input';
import { FormTextarea } from '@ringee/frontend-shared/components/forms/form-textarea';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage
} from '@ringee/frontend-shared/components/ui/form';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Trash, Plus, ArrowLeft } from 'lucide-react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import { CreateNoteModal } from '@/features/contact/components/create.note.modal';
import { TagMultiSelect, Tag } from './tag-multi-select';

import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { toast } from 'sonner';
import { ApiError } from '@ringee/frontend-shared/lib/api';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useTranslations } from 'next-intl';

const SOURCE_OPTIONS = [
  'manual',
  'csv_import',
  'crm_sync',
  'web_form',
  'referral',
  'cold_outreach',
  'inbound_call',
  'other'
];

const createFormSchema = (messages: {
  invalidEmail: string;
  phoneRequired: string;
  organizationTooShort: string;
}) =>
  z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    name: z.string().optional(),
    email: z
      .union([z.literal(''), z.string().email(messages.invalidEmail)])
      .optional(),
    phoneNumber: z.string().min(5, messages.phoneRequired),
    organization: z
      .string()
      .min(2, { message: messages.organizationTooShort })
      .optional()
      .or(z.literal('')),
    jobTitle: z.string().optional(),
    state: z.string().optional(),
    website: z.string().optional(),
    revenue: z.string().optional(),
    companySize: z.string().optional(),
    source: z.string().optional(),
    note: z.string().optional(),
    tagIds: z.array(z.string()).optional()
  });

type ContactFormValues = z.infer<ReturnType<typeof createFormSchema>>;

export interface ContactFormData {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  organization?: string;
  email: string;
  phoneNumber: string;
  jobTitle?: string | null;
  locationRegion?: string | null;
  websiteUrl?: string | null;
  revenue?: string | null;
  companySize?: string | null;
  source?: string | null;
  lastCallAt: string | null;
  notes: { id: string; content: string; createdAt: string }[];
  tags: { tag: { id: string; name: string; color?: string | null } }[];
}

export default function ContactForm({
  initialData,
  pageTitle,
  className = '',
  onSaved
}: {
  initialData: ContactFormData | null;
  pageTitle: string;
  className?: string;
  onSaved?: () => void;
}) {
  const isEdit = Boolean(initialData?.id);
  const router = useRouter();
  const api = useApi();
  const t = useTranslations('contacts.fields');
  const tCommon = useTranslations('common');

  const [loading, setLoading] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    id?: string;
  }>({
    open: false
  });

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(
      createFormSchema({
        invalidEmail: t('validation.invalidEmail'),
        phoneRequired: t('validation.phoneRequired'),
        organizationTooShort: t('validation.organizationTooShort')
      })
    ),
    defaultValues: {
      firstName: initialData?.firstName || '',
      lastName: initialData?.lastName || '',
      name: initialData?.name || '',
      organization: initialData?.company || initialData?.organization || '',
      email: initialData?.email || '',
      phoneNumber: initialData?.phoneNumber || '',
      jobTitle: initialData?.jobTitle || '',
      state: initialData?.locationRegion || '',
      website: initialData?.websiteUrl || '',
      revenue: initialData?.revenue || '',
      companySize: initialData?.companySize || '',
      source: initialData?.source || '',
      note: undefined,
      tagIds: initialData?.tags?.map((t) => t.tag.id) || []
    }
  });

  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    api
      .get<Tag[]>('/tags')
      .then(setTags)
      .catch(() => setTags([]));
  }, [api]);

  const handleCreateTag = useCallback(
    async (name: string, color?: string): Promise<Tag> => {
      try {
        const colors = [
          '#ef4444',
          '#f97316',
          '#f59e0b',
          '#22c55e',
          '#3b82f6',
          '#6366f1',
          '#a855f7',
          '#ec4899'
        ];
        const randomColor =
          color || colors[Math.floor(Math.random() * colors.length)];

        const newTag = await api.post<Tag>('/tags', {
          name,
          color: randomColor
        });
        setTags((prev) => [
          ...prev.sort((a, b) => a.name.localeCompare(b.name)),
          newTag
        ]);
        return newTag;
      } catch (err) {
        toast.error(tCommon('somethingWentWrong'));
        throw err;
      }
    },
    [api, tCommon]
  );

  async function onSubmit(values: ContactFormValues) {
    try {
      setLoading(true);
      const payload = {
        ...values,
        name:
          values.name ||
          [values.firstName, values.lastName].filter(Boolean).join(' ') ||
          undefined
      };
      if (!isEdit) await api.post('/contacts', payload);
      else await api.put(`/contacts/${initialData?.id}`, payload);
      if (!onSaved) router.push('/dashboard/contact');

      onSaved?.();

      toast.success(t('savedSuccessfully'));
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error(t('somethingWentWrong'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteNote() {
    if (!initialData?.id || !deleteModal.id) return;
    setLoading(true);
    try {
      await api.delete(`/contacts/${initialData.id}/notes/${deleteModal.id}`);
      setDeleteModal({ open: false });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        'mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-2',
        className
      )}
    >
      <Card>
        <CardHeader>
          <div className='flex items-center gap-3'>
            <Button variant='ghost' size='icon' onClick={() => router.back()}>
              <ArrowLeft className='h-4 w-4' />
            </Button>
            <CardTitle className='text-left text-2xl font-bold'>
              {pageTitle}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Form
            // @ts-ignore
            form={form}
            onSubmit={form.handleSubmit(onSubmit)}
            className='space-y-8'
          >
            <div className='grid grid-cols-1 gap-6'>
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                <FormInput
                  control={form.control}
                  name='firstName'
                  label={t('firstName')}
                  placeholder='John'
                />
                <FormInput
                  control={form.control}
                  name='lastName'
                  label={t('lastName')}
                  placeholder='Doe'
                />
              </div>

              <FormInput
                control={form.control}
                name='name'
                label={t('displayName')}
                placeholder={t('displayNamePlaceholder')}
              />

              <div className='space-y-2'>
                <label className='text-sm font-medium'>
                  {t('phoneNumber')} <span className='text-red-500'> * </span>
                </label>
                <Controller
                  name='phoneNumber'
                  control={form.control}
                  render={({ field }) => (
                    <PhoneInput
                      international
                      defaultCountry='US'
                      // @ts-ignore
                      value={field.value}
                      onChange={field.onChange}
                      className='border-input focus-within:ring-primary flex min-h-[44px] items-center rounded-md border bg-transparent px-3 py-2 text-sm focus-within:ring-2'
                    />
                  )}
                />
                {form.formState.errors.phoneNumber && (
                  <p className='text-sm text-red-500'>
                    {form.formState.errors.phoneNumber.message}
                  </p>
                )}
              </div>

              <FormInput
                control={form.control}
                name='email'
                label={t('email')}
                placeholder={t('emailPlaceholder') || 'john@example.com'}
              />

              <Separator />

              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                <FormInput
                  control={form.control}
                  name='organization'
                  label={t('companyOrOrg')}
                  placeholder={t('companyPlaceholder')}
                />
                <FormInput
                  control={form.control}
                  name='jobTitle'
                  label={t('jobTitle')}
                  placeholder={t('jobTitlePlaceholder')}
                />
              </div>

              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                <FormInput
                  control={form.control}
                  name='state'
                  label={t('state')}
                  placeholder={t('statePlaceholder')}
                />
                <FormInput
                  control={form.control}
                  name='website'
                  label={t('website')}
                  placeholder='https://acme.com'
                />
              </div>

              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                <FormInput
                  control={form.control}
                  name='revenue'
                  label={t('revenue')}
                  placeholder='$10M–$50M'
                />
                <FormInput
                  control={form.control}
                  name='companySize'
                  label={t('companySize')}
                  placeholder='51–200'
                />
              </div>

              <FormField
                control={form.control}
                name='source'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('source')}</FormLabel>
                    <FormControl>
                      <select
                        value={field.value || ''}
                        onChange={field.onChange}
                        className='border-input bg-background ring-offset-background focus:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50'
                      >
                        <option value=''>{t('selectSource')}</option>
                        {SOURCE_OPTIONS.map((src) => (
                          <option key={src} value={src}>
                            {t(`sources.${src}` as 'sources.manual')}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='tagIds'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('tags')}</FormLabel>
                    <FormControl>
                      <TagMultiSelect
                        availableTags={tags}
                        selectedTagIds={field.value || []}
                        onSelectionChange={field.onChange}
                        onCreateTag={handleCreateTag}
                        placeholder={t('selectOrCreateTags')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {!isEdit && (
              <FormTextarea
                control={form.control}
                name='note'
                label={t('note')}
                placeholder={t('notePlaceholder')}
                config={{
                  maxLength: 500,
                  showCharCount: true,
                  rows: 4
                }}
              />
            )}

            <div className='flex justify-end'>
              <Button type='submit' disabled={loading}>
                {loading
                  ? t('saving')
                  : isEdit
                    ? t('updateContact')
                    : t('addContact')}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>

      {isEdit && (
        <Card>
          <CardHeader>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-lg font-semibold'>
                {t('notes')}
              </CardTitle>
              <Button
                size='sm'
                className='gap-1'
                onClick={() => setNoteModalOpen(true)}
              >
                <Plus className='h-4 w-4' /> {t('addNote')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Separator className='mb-4' />
            <div className='max-h-[500px] space-y-3 overflow-y-auto pr-1'>
              {initialData?.notes?.length ? (
                initialData.notes.map((note) => (
                  <div
                    key={note.id}
                    className='flex items-start justify-between rounded-md p-3'
                  >
                    <div>
                      <p className='text-sm'>{note.content}</p>
                      <p className='mt-1 text-xs'>
                        {new Date(note.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <Button
                      size='icon'
                      variant='ghost'
                      onClick={() =>
                        setDeleteModal({ open: true, id: note.id })
                      }
                      title={t('deleteNote')}
                    >
                      <Trash className='text-muted-foreground h-4 w-4 hover:text-red-600' />
                    </Button>
                  </div>
                ))
              ) : (
                <p className='text-muted-foreground text-sm'>
                  {t('noNotesYet')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <CreateNoteModal
        open={noteModalOpen}
        onOpenChange={setNoteModalOpen}
        // The notes card, and so this modal, is only reachable while editing an
        // existing contact.
        contactId={initialData?.id as string}
        onSave={() => {
          router.refresh();
          setNoteModalOpen(false);
        }}
      />

      <AlertDialog
        open={deleteModal.open}
        onOpenChange={(open) => setDeleteModal({ open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteNote')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteNoteConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNote}
              disabled={loading}
              className='bg-red-600 text-white hover:bg-red-700'
            >
              {loading ? t('deleting') : t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
