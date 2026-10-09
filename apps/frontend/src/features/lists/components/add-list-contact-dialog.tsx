'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { IconLoader2, IconSearch } from '@tabler/icons-react';
import PhoneInput, { type Value } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@ringee/frontend-shared/components/ui/form';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { FormInput } from '@ringee/frontend-shared/components/forms/form-input';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useDebounce } from '@ringee/frontend-shared/hooks/use-debounce';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { describeApiError } from '@/features/ai-voice-agents/lib/api-error';
import type { ContactList } from '../types';

const SEARCH_LIMIT = 8;

interface AddedContact {
  contact: { id: string; name: string | null; phoneNumber: string };
  created: boolean;
  added: boolean;
}

interface ContactMatch {
  id: string;
  name: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber: string;
  company?: string | null;
}

/**
 * Adds people to a list by hand: a new person typed in, or contacts the
 * workspace already has. A typed number the workspace knows is reused, never
 * copied (LIST-003). Stays open so several can go in one after another.
 */
export function AddListContactDialog({
  list,
  open,
  onOpenChange
}: {
  list: ContactList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('lists.add');
  const [tab, setTab] = useState('new');

  const close = () => {
    setTab('new');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className='max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='new'>{t('newTab')}</TabsTrigger>
            <TabsTrigger value='existing'>{t('existingTab')}</TabsTrigger>
          </TabsList>
          <TabsContent value='new'>
            <NewContactForm list={list} onClose={close} />
          </TabsContent>
          <TabsContent value='existing'>
            <ExistingContactsPicker list={list} onClose={close} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function NewContactForm({
  list,
  onClose
}: {
  list: ContactList;
  onClose: () => void;
}) {
  const t = useTranslations('lists.add');
  const tCommon = useTranslations('common');
  const api = useApi();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        phoneNumber: z.string().min(5, t('phoneRequired')),
        name: z.string().max(100),
        email: z.union([
          z.literal(''),
          z.string().email(t('invalidEmail')).max(100)
        ]),
        organization: z.string().max(100),
        jobTitle: z.string().max(100)
      }),
    [t]
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      phoneNumber: '',
      name: '',
      email: '',
      organization: '',
      jobTitle: ''
    }
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const result = await api.post<AddedContact>(
        `/contact-lists/${list.id}/contacts/new`,
        {
          phoneNumber: values.phoneNumber,
          name: values.name.trim() || undefined,
          email: values.email.trim() || undefined,
          organization: values.organization.trim() || undefined,
          jobTitle: values.jobTitle.trim() || undefined
        }
      );
      const name = result.contact.name || result.contact.phoneNumber;
      if (!result.added) toast.info(t('alreadyInList', { name }));
      else if (result.created) toast.success(t('added', { name }));
      else toast.success(t('existingAdded', { name }));
      form.reset();
      router.refresh();
    } catch (error) {
      toast.error(describeApiError(error, t('failed')));
    } finally {
      setSaving(false);
    }
  });

  return (
    <Form form={form} onSubmit={onSubmit} className='space-y-4 pt-2'>
      <FormField
        control={form.control}
        name='phoneNumber'
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {t('phone')}
              <span className='ml-1 text-red-500'>*</span>
            </FormLabel>
            <FormControl>
              <PhoneInput
                international
                defaultCountry='US'
                value={(field.value || undefined) as Value | undefined}
                onChange={(value) => field.onChange(value ?? '')}
                className='border-input focus-within:ring-primary flex min-h-[40px] items-center rounded-md border bg-transparent px-3 py-1.5 text-sm focus-within:ring-2'
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormInput control={form.control} name='name' label={t('name')} />
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormInput
          control={form.control}
          name='organization'
          label={t('company')}
        />
        <FormInput
          control={form.control}
          name='jobTitle'
          label={t('jobTitle')}
        />
      </div>
      <FormInput
        control={form.control}
        name='email'
        type='email'
        label={t('email')}
      />
      <DialogFooter className='gap-2 sm:gap-2'>
        <Button type='button' variant='outline' onClick={onClose}>
          {tCommon('close')}
        </Button>
        <Button type='submit' disabled={saving}>
          {saving ? (
            <>
              <IconLoader2 className='mr-2 size-4 animate-spin' />
              {t('adding')}
            </>
          ) : (
            t('submit')
          )}
        </Button>
      </DialogFooter>
    </Form>
  );
}

function matchName(contact: ContactMatch): string {
  return (
    contact.name?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
    contact.phoneNumber
  );
}

function ExistingContactsPicker({
  list,
  onClose
}: {
  list: ContactList;
  onClose: () => void;
}) {
  const t = useTranslations('lists.add');
  const tCommon = useTranslations('common');
  const api = useApi();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const search = useDebounce(query.trim(), 300);
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Map<string, ContactMatch>>(
    () => new Map()
  );
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!search) {
      setMatches([]);
      return;
    }
    let active = true;
    setSearching(true);
    api
      .get<{ data: ContactMatch[] }>('/contacts', {
        search,
        page: 1,
        limit: SEARCH_LIMIT
      })
      .then((res) => {
        if (active) setMatches(res.data ?? []);
      })
      .catch(() => {
        if (active) setMatches([]);
      })
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [api, search]);

  const toggle = (contact: ContactMatch) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(contact.id)) next.delete(contact.id);
      else next.set(contact.id, contact);
      return next;
    });
  };

  const add = async () => {
    if (selected.size === 0) return;
    setAdding(true);
    try {
      const result = await api.post<{ added: number; alreadyInList: number }>(
        `/contact-lists/${list.id}/contacts`,
        { contactIds: [...selected.keys()] }
      );
      toast.success(t('addedMany', { added: result.added }));
      setSelected(new Map());
      router.refresh();
    } catch (error) {
      toast.error(describeApiError(error, t('failed')));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className='space-y-3 pt-2'>
      <div className='relative'>
        <IconSearch className='text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2' />
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('searchPlaceholder')}
          className='pl-9'
        />
      </div>

      <div className='min-h-40 rounded-lg border'>
        {!search ? (
          <p className='text-muted-foreground p-4 text-center text-sm'>
            {t('searchHint')}
          </p>
        ) : searching && matches.length === 0 ? (
          <div className='flex justify-center p-4'>
            <IconLoader2 className='text-muted-foreground size-5 animate-spin' />
          </div>
        ) : matches.length === 0 ? (
          <p className='text-muted-foreground p-4 text-center text-sm'>
            {t('noMatches')}
          </p>
        ) : (
          <ul className='divide-y'>
            {matches.map((contact) => {
              const checked = selected.has(contact.id);
              return (
                <li key={contact.id}>
                  <label
                    className={cn(
                      'hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2.5',
                      checked && 'bg-muted/40'
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(contact)}
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-sm font-medium'>
                        {matchName(contact)}
                      </span>
                      <span className='text-muted-foreground block truncate text-xs'>
                        {[contact.phoneNumber, contact.company]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DialogFooter className='gap-2 sm:gap-2'>
        <Button type='button' variant='outline' onClick={onClose}>
          {tCommon('close')}
        </Button>
        <Button
          onClick={() => void add()}
          disabled={selected.size === 0 || adding}
        >
          {adding ? (
            <>
              <IconLoader2 className='mr-2 size-4 animate-spin' />
              {t('adding')}
            </>
          ) : selected.size > 0 ? (
            t('addSelected', { count: selected.size })
          ) : (
            t('submit')
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}
