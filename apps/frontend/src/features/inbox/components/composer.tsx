'use client';

import { useState, useEffect } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Loader2, Send, StickyNote, MessageSquare } from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { InboxThread } from '../types';
import { useNumbers, useThreadActions } from '../hooks/use-inbox';
import { useTranslations } from 'next-intl';

interface Props {
  thread: InboxThread;
  onAfterAction: () => void;
}

type Mode = 'sms' | 'note';

export function Composer({ thread, onAfterAction }: Props) {
  const t = useTranslations('inbox.composer');
  const [mode, setMode] = useState<Mode>('sms');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fromNumber, setFromNumber] = useState<string | null>(
    thread.ringeeNumber
  );
  const numbers = useNumbers();
  const actions = useThreadActions(onAfterAction);

  useEffect(() => {
    setFromNumber(thread.ringeeNumber ?? numbers[0]?.phoneNumber ?? null);
  }, [thread.id, thread.ringeeNumber, numbers]);

  async function submit() {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      if (mode === 'note') {
        await actions.addNote(thread.id, text.trim());
      } else {
        if (!fromNumber) return;

        const target = thread.participantNumberE164 ?? thread.participantNumber;

        await actions.sendSms({
          fromNumber,
          toNumber: target,
          text: text.trim(),
          threadId: thread.id,
          contactId: thread.contactId ?? undefined
        });
      }
      setText('');
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

  const smsCapable = numbers.find(
    (n) => n.phoneNumber === fromNumber
  )?.smsEnabled;

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
      <div className='flex items-end gap-2 p-3'>
        <Textarea
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
          disabled={
            submitting ||
            !text.trim() ||
            (mode === 'sms' && (!fromNumber || smsCapable === false))
          }
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
