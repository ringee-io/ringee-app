'use client';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconSparkles, IconUser } from '@tabler/icons-react';
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
      {busy && !streamingAssistantId && (
        <ChatRow role='assistant' content='Thinking…' streaming />
      )}
      <div ref={bottomRef} />
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
      {!isUser && (
        <div className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary'>
          <IconSparkles size={14} />
        </div>
      )}
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
