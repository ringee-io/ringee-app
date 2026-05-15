'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { IconSend, IconLoader2 } from '@tabler/icons-react';
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState
} from 'react';

interface Props {
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
  onSubmit: (text: string) => void;
}

export interface ChatInputHandle {
  fill(text: string): void;
  focus(): void;
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput(
  { disabled, sending, placeholder, onSubmit },
  ref
) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useImperativeHandle(ref, () => ({
    fill(text: string) {
      setValue(text);
      // Defer focus to next tick so the textarea has the new value.
      queueMicrotask(() => textareaRef.current?.focus());
    },
    focus() {
      textareaRef.current?.focus();
    }
  }));

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    onSubmit(trimmed);
    setValue('');
  }

  return (
    <div className='border-t border-border/60 bg-background/80 px-4 py-3 backdrop-blur'>
      <div className='mx-auto flex max-w-3xl items-end gap-2'>
        <Textarea
          ref={textareaRef}
          value={value}
          disabled={disabled}
          placeholder={placeholder ?? 'Describe who you want to sell to…'}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          className='min-h-[48px] resize-none rounded-xl border-border/80 bg-background shadow-sm'
        />
        <Button
          onClick={submit}
          disabled={disabled || sending || !value.trim()}
          className='h-11 rounded-xl px-4'
        >
          {sending ? (
            <IconLoader2 size={16} className='animate-spin' />
          ) : (
            <IconSend size={16} />
          )}
        </Button>
      </div>
      <div className='mx-auto mt-1.5 max-w-3xl text-[11px] text-muted-foreground'>
        Press Enter to send · Shift+Enter for newline
      </div>
    </div>
  );
});
