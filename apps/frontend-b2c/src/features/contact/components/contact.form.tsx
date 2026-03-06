'use client';

import { useState, useEffect, useCallback } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import * as z from 'zod';

import { FormInput } from '@ringee/frontend-shared/components/forms/form-input';
import { FormTextarea } from '@ringee/frontend-shared/components/forms/form-textarea';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@ringee/frontend-shared/components/ui/card';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@ringee/frontend-shared/components/ui/form';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Trash, Plus } from 'lucide-react';
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

const formSchema = z.object({
  organization: z
    .string()
    .min(2, { message: 'Organization name must be at least 2 characters.' })
    .optional(),
  name: z
    .string()
    .min(2, { message: 'Contact name must be at least 2 characters.' }),
  email: z.email('Invalid email format').optional(),
  phoneNumber: z.string().min(5, 'Phone number is required'),
  note: z.string().optional(),
  tagIds: z.array(z.string()).optional()
});

type ContactFormValues = z.infer<typeof formSchema>;

export default function ContactForm({
  initialData,
  pageTitle,
  className = '',
  onSaved
}: {
  initialData: {
    id: string;
    name: string;
    company?: string | null;
    organization?: string;
    email: string;
    phoneNumber: string;
    lastCallAt: string | null;
    notes: { id: string; content: string; createdAt: string }[];
    tags: { tag: { id: string; name: string; color?: string | null } }[];
  } | null;
  pageTitle: string;
  className?: string;
  onSaved?: () => void;
}) {
  const isEdit = Boolean(initialData?.id);
  const router = useRouter();
  const api = useApi();

  const [loading, setLoading] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    id?: string;
  }>({
    open: false
  });

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || '',
      organization: initialData?.company || initialData?.organization || undefined,
      email: initialData?.email || undefined,
      phoneNumber: initialData?.phoneNumber || '',
      note: undefined,
      tagIds: initialData?.tags?.map((t) => t.tag.id) || []
    }
  });
  
  // Set initial tags for the selector if editing
  const [tags, setTags] = useState<Tag[]>([]);
  
  // Fetch available tags
  useEffect(() => {
    api.get<Tag[]>('/tags').then(setTags).catch(() => setTags([]));
  }, [api]);
  
  // Create tag handler
  const handleCreateTag = useCallback(async (name: string, color?: string): Promise<Tag> => {
    try {
      const colors = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];
      const randomColor = color || colors[Math.floor(Math.random() * colors.length)];
      
      const newTag = await api.post<Tag>('/tags', { name, color: randomColor });
      setTags(prev => [...prev.sort((a, b) => a.name.localeCompare(b.name)), newTag]);
      return newTag;
    } catch (err) {
      toast.error('Failed to create tag');
      throw err;
    }
  }, [api]);

  async function onSubmit(values: ContactFormValues) {
    try {
      setLoading(true);
      if (!isEdit) await api.post('/contacts', values);
      else await api.put(`/contacts/${initialData?.id}`, values);
      if (!onSaved) router.push('/contacts');

      onSaved?.();

      toast.success('Contact saved successfully');
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error('Something went wrong');
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
      {/* 🔹 LEFT: Contact Form */}
      <Card>
        <CardHeader>
          <CardTitle className='text-left text-2xl font-bold'>
            {pageTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form
            // @ts-ignore
            form={form}
            onSubmit={form.handleSubmit(onSubmit)}
            className='space-y-8'
          >
            <div className='grid grid-cols-1 gap-6'>
              <FormInput
                control={form.control}
                name='name'
                label='Name'
                placeholder='Enter contact name'
                required
              />

              {/* ✅ Custom Phone Input */}
              <div className='space-y-2'>
                <label className='text-sm font-medium'>
                  Phone Number <span className='text-red-500'> * </span>{' '}
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
                      className='border-input focus-within:ring-primary rounded-md border bg-transparent px-3 py-2 text-sm focus-within:ring-2 flex items-center min-h-[44px]'
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
                name='organization'
                label='Organization'
                placeholder='Enter organization'
              />
              <FormInput
                control={form.control}
                name='email'
                label='Email'
                placeholder='Enter email'
              />

              {/* Tags Input */}
              <FormField
                control={form.control}
                name="tagIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <TagMultiSelect
                        availableTags={tags}
                        selectedTagIds={field.value || []}
                        onSelectionChange={field.onChange}
                        onCreateTag={handleCreateTag}
                        placeholder="Select or create tags..."
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
                label='Note'
                placeholder='Write something about this contact...'
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
                  ? 'Saving...'
                  : isEdit
                    ? 'Update Contact'
                    : 'Add Contact'}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>

      {/* 🔹 RIGHT: Notes Section */}
      {isEdit && (
        <Card>
          <CardHeader>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-lg font-semibold'>Notes</CardTitle>
              <Button
                size='sm'
                className='gap-1'
                onClick={() => setNoteModalOpen(true)}
              >
                <Plus className='h-4 w-4' /> Add Note
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
                      title='Delete note'
                    >
                      <Trash className='text-muted-foreground h-4 w-4 hover:text-red-600' />
                    </Button>
                  </div>
                ))
              ) : (
                <p className='text-muted-foreground text-sm'>No notes yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 📝 Modal para crear nota */}
      <CreateNoteModal
        open={noteModalOpen}
        onOpenChange={setNoteModalOpen}
        contactId={initialData?.id!}
        onSave={() => {
          router.refresh();
          setNoteModalOpen(false);
        }}
      />

      {/* 🗑️ Modal eliminar nota */}
      <AlertDialog
        open={deleteModal.open}
        onOpenChange={(open) => setDeleteModal({ open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNote}
              disabled={loading}
              className='bg-red-600 text-white hover:bg-red-700'
            >
              {loading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
