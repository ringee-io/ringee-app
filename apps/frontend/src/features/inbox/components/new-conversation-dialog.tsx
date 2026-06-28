'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Loader2, Pencil, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { InboxThread } from '../types';
import { useNumbers } from '../hooks/use-inbox';
import { ContactPicker, PickableContact, contactLabel } from './contact-picker';

interface Props {
  onCreated: (thread: InboxThread) => void;
}

const E164 = /^\+[1-9]\d{6,14}$/;

export function NewConversationDialog({ onCreated }: Props) {
  const t = useTranslations('inbox.newConversation');
  const api = useApi();
  const numbers = useNumbers();
  const smsNumbers = useMemo(
    () => numbers.filter((n) => n.smsEnabled),
    [numbers]
  );

  const [open, setOpen] = useState(false);
  const [fromNumber, setFromNumber] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickableContact | null>(null);
  const [manualNumber, setManualNumber] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!fromNumber && smsNumbers.length > 0) {
      setFromNumber(smsNumbers[0].phoneNumber);
    }
  }, [smsNumbers, fromNumber]);

  function reset() {
    setPicked(null);
    setManualNumber('');
    setText('');
  }

  const toNumber = picked?.phoneNumber?.trim() || manualNumber.trim();
  const canSend = !!fromNumber && E164.test(toNumber) && !!text.trim();

  async function send() {
    if (!canSend || !fromNumber) return;
    setSending(true);
    try {
      const message = await api.post<{ threadId: string }>('/inbox/messages', {
        fromNumber,
        toNumber,
        text: text.trim(),
        contactId: picked?.id
      });
      if (message?.threadId) {
        const thread = await api.get<InboxThread>(
          `/inbox/threads/${message.threadId}`
        );
        if (thread) onCreated(thread);
      }
      setOpen(false);
      reset();
    } catch {
      toast.error(t('sendError'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size='sm' className='w-full'>
          <Plus className='mr-1 h-4 w-4' /> {t('newMessage')}
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className='space-y-3'>
          <div className='space-y-1'>
            <label className='text-muted-foreground text-xs font-medium'>
              {t('from')}
            </label>
            <Select
              value={fromNumber ?? undefined}
              onValueChange={setFromNumber}
            >
              <SelectTrigger className='text-sm'>
                <SelectValue placeholder={t('selectNumber')} />
              </SelectTrigger>
              <SelectContent>
                {smsNumbers.map((n) => (
                  <SelectItem key={n.id} value={n.phoneNumber}>
                    {n.phoneNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {smsNumbers.length === 0 && (
              <p className='text-xs text-amber-600'>{t('noSmsNumbers')}</p>
            )}
          </div>

          <div className='space-y-1'>
            <label className='text-muted-foreground text-xs font-medium'>
              {t('to')}
            </label>
            {picked ? (
              <div className='flex items-center gap-2 rounded-md border px-3 py-2'>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm'>{contactLabel(picked)}</p>
                  <p className='text-muted-foreground truncate text-xs'>
                    {picked.phoneNumber}
                  </p>
                </div>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7'
                  onClick={() => setPicked(null)}
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>
            ) : (
              <>
                <div className='relative'>
                  <Pencil className='text-muted-foreground absolute top-2.5 left-2.5 h-3.5 w-3.5' />
                  <Input
                    value={manualNumber}
                    onChange={(e) => setManualNumber(e.target.value)}
                    placeholder={t('manualPlaceholder')}
                    className='pl-8 text-sm'
                  />
                </div>
                <ContactPicker onPick={setPicked} />
              </>
            )}
          </div>

          <div className='space-y-1'>
            <label className='text-muted-foreground text-xs font-medium'>
              {t('message')}
            </label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={t('messagePlaceholder')}
              className='resize-none text-sm'
            />
          </div>

          <Button
            className='w-full'
            disabled={!canSend || sending}
            onClick={send}
          >
            {sending ? <Loader2 className='h-4 w-4 animate-spin' /> : t('send')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
