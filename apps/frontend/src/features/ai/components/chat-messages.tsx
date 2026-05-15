'use client';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconUser } from '@tabler/icons-react';
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import type { AiMessage } from '../types';

interface Props {
  messages: AiMessage[];
  streamingAssistantId: string | null;
  busy: boolean;
}

export function ChatMessages({ messages, streamingAssistantId, busy }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, streamingAssistantId]);

  // Show only user + assistant text messages. Tool turns are rendered as
  // structured cards by other panels.
  const visible = messages.filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && !m.toolName
  );

  return (
    <div className='flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4'>
      {visible.map((m) => (
        <ChatRow
          key={m.id}
          role={m.role as 'user' | 'assistant'}
          content={m.content ?? ''}
          streaming={m.id === streamingAssistantId}
        />
      ))}
      {busy && !streamingAssistantId && <ThinkingRow />}
      <div ref={bottomRef} />
    </div>
  );
}

function AssistantAvatar({ thinking = false }: { thinking?: boolean }) {
  return (
    <div
      className={cn(
        'relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background ring-1 ring-border/60',
        thinking && 'ring-primary/40'
      )}
    >
      <Image
        src='/android-chrome-192x192.png'
        alt='Ringee'
        width={28}
        height={28}
        className='h-full w-full object-cover'
      />
      {thinking && (
        <span
          aria-hidden
          className='pointer-events-none absolute inset-0 animate-ping rounded-full ring-2 ring-primary/40'
        />
      )}
    </div>
  );
}

function ChatRow({
  role,
  content,
  streaming
}: {
  role: 'user' | 'assistant';
  content: string;
  streaming: boolean;
}) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex w-full gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && <AssistantAvatar />}
      <div
        className={cn(
          'max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        {content || (streaming ? '…' : '')}
        {streaming && content && (
          <span className='ml-0.5 inline-block h-3 w-1 animate-pulse bg-current align-middle' />
        )}
      </div>
      {isUser && (
        <div className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'>
          <IconUser size={14} />
        </div>
      )}
    </div>
  );
}

function ThinkingRow() {
  return (
    <div className='flex w-full justify-start gap-2'>
      <AssistantAvatar thinking />
      <div className='flex items-center gap-2 rounded-2xl bg-muted px-3 py-2.5 text-sm text-foreground shadow-sm'>
        <span className='ringee-thinking-shimmer font-medium'>Thinking</span>
        <span className='flex items-center gap-1 text-muted-foreground' aria-hidden>
          <span
            className='ringee-thinking-dot'
            style={{ animationDelay: '0ms' }}
          />
          <span
            className='ringee-thinking-dot'
            style={{ animationDelay: '150ms' }}
          />
          <span
            className='ringee-thinking-dot'
            style={{ animationDelay: '300ms' }}
          />
        </span>
      </div>
    </div>
  );
}
