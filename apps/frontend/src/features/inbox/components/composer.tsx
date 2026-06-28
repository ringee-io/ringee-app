'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import {
  Loader2,
  Send,
  StickyNote,
  MessageSquare,
  Paperclip,
  X,
  FileText
} from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { InboxThread } from '../types';
import { useNumbers, useThreadActions } from '../hooks/use-inbox';
import { useTranslations } from 'next-intl';

interface Props {
  thread: InboxThread;
  onAfterAction: () => void;
}

type Mode = 'sms' | 'note';

interface Attachment {
  url: string;
  name: string;
  isImage: boolean;
}

const MAX_ATTACHMENTS = 10;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|heic)$/i;

export function Composer({ thread, onAfterAction }: Props) {
  const t = useTranslations('inbox.composer');
  const api = useApi();
  const [mode, setMode] = useState<Mode>('sms');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [media, setMedia] = useState<Attachment[]>([]);
  const [fromNumber, setFromNumber] = useState<string | null>(
    thread.ringeeNumber
  );
  const numbers = useNumbers();
  const actions = useThreadActions(onAfterAction);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFromNumber(thread.ringeeNumber ?? numbers[0]?.phoneNumber ?? null);
    setMedia([]);
  }, [thread.id, thread.ringeeNumber, numbers]);

  // The context pane "Add note" action focuses the composer in note mode.
  useEffect(() => {
    const onNote = () => {
      setMode('note');
      setTimeout(() => textareaRef.current?.focus(), 0);
    };
    window.addEventListener('ringee:inbox-note', onNote);
    return () => window.removeEventListener('ringee:inbox-note', onNote);
  }, []);

  const selected = numbers.find((n) => n.phoneNumber === fromNumber);
  const smsCapable = selected?.smsEnabled;
  const mmsCapable = selected?.mmsEnabled;

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    const room = MAX_ATTACHMENTS - media.length;
    setUploading(true);
    try {
      for (const file of files.slice(0, room)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.upload<{ url: string }>('/inbox/media', fd);
        if (res?.url) {
          setMedia((m) => [
            ...m,
            {
              url: res.url,
              name: file.name,
              isImage:
                file.type.startsWith('image/') || IMAGE_RE.test(file.name)
            }
          ]);
        }
      }
    } catch {
      toast.error(t('attachError'));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    const trimmed = text.trim();
    if (mode === 'note') {
      if (!trimmed) return;
      setSubmitting(true);
      try {
        await actions.addNote(thread.id, trimmed);
        setText('');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!fromNumber || (!trimmed && media.length === 0)) return;
    setSubmitting(true);
    try {
      const target = thread.participantNumberE164 ?? thread.participantNumber;
      await actions.sendSms({
        fromNumber,
        toNumber: target,
        text: trimmed || undefined,
        mediaUrls: media.length ? media.map((m) => m.url) : undefined,
        threadId: thread.id,
        contactId: thread.contactId ?? undefined
      });
      setText('');
      setMedia([]);
    } finally {
      setSubmitting(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  const sendDisabled =
    submitting ||
    uploading ||
    (mode === 'note'
      ? !text.trim()
      : !fromNumber ||
        smsCapable === false ||
        (!text.trim() && media.length === 0));

  return (
    <div className='bg-background border-t'>
      <div className='flex items-center gap-2 px-3 pt-3'>
        <button
          type='button'
          onClick={() => setMode('sms')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs',
            mode === 'sms'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          )}
        >
          <MessageSquare className='h-3.5 w-3.5' /> {t('sms')}
        </button>
        <button
          type='button'
          onClick={() => setMode('note')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs',
            mode === 'note'
              ? 'bg-yellow-400 text-yellow-950'
              : 'bg-muted text-muted-foreground'
          )}
        >
          <StickyNote className='h-3.5 w-3.5' /> {t('internalNote')}
        </button>

        {mode === 'sms' && numbers.length > 0 && (
          <div className='ml-auto'>
            <Select
              value={fromNumber ?? undefined}
              onValueChange={(v) => setFromNumber(v)}
            >
              <SelectTrigger className='h-7 w-[180px] text-xs'>
                <SelectValue placeholder={t('selectNumber')} />
              </SelectTrigger>
              <SelectContent>
                {numbers.map((n) => (
                  <SelectItem
                    key={n.id}
                    value={n.phoneNumber}
                    disabled={!n.smsEnabled}
                  >
                    {n.phoneNumber}
                    {!n.smsEnabled && t('noSmsSuffix')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {mode === 'sms' && media.length > 0 && (
        <div className='flex flex-wrap gap-2 px-3 pt-2'>
          {media.map((m, i) => (
            <div
              key={`${m.url}-${i}`}
              className='group relative h-14 w-14 overflow-hidden rounded-md border'
            >
              {m.isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.url}
                  alt={m.name}
                  className='h-full w-full object-cover'
                />
              ) : (
                <div className='text-muted-foreground flex h-full w-full items-center justify-center'>
                  <FileText className='h-5 w-5' />
                </div>
              )}
              <button
                type='button'
                onClick={() =>
                  setMedia((arr) => arr.filter((_, idx) => idx !== i))
                }
                className='absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white'
              >
                <X className='h-3 w-3' />
              </button>
            </div>
          ))}
          {uploading && (
            <div className='flex h-14 w-14 items-center justify-center rounded-md border'>
              <Loader2 className='text-muted-foreground h-4 w-4 animate-spin' />
            </div>
          )}
        </div>
      )}

      <div className='flex items-end gap-2 p-3'>
        {mode === 'sms' && (
          <>
            <input
              ref={fileInputRef}
              type='file'
              accept='image/*,video/*,audio/*'
              multiple
              hidden
              onChange={onFiles}
            />
            <Button
              type='button'
              variant='outline'
              size='icon'
              className='shrink-0'
              title={mmsCapable === false ? t('mmsDisabled') : t('attach')}
              disabled={
                mmsCapable === false ||
                uploading ||
                media.length >= MAX_ATTACHMENTS
              }
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className='h-4 w-4' />
            </Button>
          </>
        )}
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder={
            mode === 'note' ? t('notePlaceholder') : t('messagePlaceholder')
          }
          className={cn(
            'min-h-[60px] flex-1 resize-none',
            mode === 'note' && 'bg-yellow-50/60 dark:bg-yellow-950/30'
          )}
        />
        <Button
          type='button'
          disabled={sendDisabled}
          onClick={submit}
          className='shrink-0'
        >
          {submitting ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <>
              <Send className='mr-1 h-4 w-4' />
              {mode === 'note' ? t('saveNote') : t('send')}
            </>
          )}
        </Button>
      </div>
      {mode === 'sms' && fromNumber && smsCapable === false && (
        <p className='px-3 pb-2 text-xs text-amber-600'>
          {t('smsDisabledWarning')}
        </p>
      )}
    </div>
  );
}
