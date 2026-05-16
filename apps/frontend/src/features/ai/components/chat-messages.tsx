'use client';

import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  IconBolt,
  IconChevronDown,
  IconUser
} from '@tabler/icons-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
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
          message={m}
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
  message,
  streaming
}: {
  message: AiMessage;
  streaming: boolean;
}) {
  const isUser = message.role === 'user';
  const content = message.content ?? '';
  const showUsage =
    !isUser &&
    !streaming &&
    message.status === 'completed' &&
    hasUsage(message);

  return (
    <div className={cn('flex w-full flex-col gap-1', isUser && 'items-end')}>
      <div
        className={cn(
          'flex w-full gap-2',
          isUser ? 'justify-end' : 'justify-start'
        )}
      >
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
      {showUsage && <UsageLine message={message} />}
    </div>
  );
}

function UsageLine({ message }: { message: AiMessage }) {
  const [open, setOpen] = useState(false);
  const input = message.inputTokens ?? 0;
  const output = message.outputTokens ?? 0;
  const cached = message.cachedTokens ?? 0;
  const cacheWrite = message.cacheWriteTokens ?? 0;
  const cost = message.costCredits ?? 0;

  return (
    <div className='ml-9 flex flex-col gap-0.5'>
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        className='group flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground'
        title='Token usage for this response'
      >
        <IconBolt
          size={11}
          className='text-amber-500'
          fill='currentColor'
        />
        <span className='tabular-nums'>{formatTokens(input)} in</span>
        <span className='text-muted-foreground/50'>·</span>
        <span className='tabular-nums'>{formatTokens(output)} out</span>
        <span className='text-muted-foreground/50'>·</span>
        <span className='font-medium tabular-nums text-foreground/80'>
          {formatCredits(cost)} cr
        </span>
        <IconChevronDown
          size={11}
          className={cn(
            'transition-transform duration-150',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && (
        <div className='ml-1 flex flex-wrap gap-x-3 gap-y-0.5 rounded-md bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground'>
          <UsageDetail label='Input' value={`${formatTokens(input)} tokens`} />
          <UsageDetail label='Output' value={`${formatTokens(output)} tokens`} />
          {cached > 0 && (
            <UsageDetail
              label='Cache read'
              value={`${formatTokens(cached)} tokens`}
            />
          )}
          {cacheWrite > 0 && (
            <UsageDetail
              label='Cache write'
              value={`${formatTokens(cacheWrite)} tokens`}
            />
          )}
          <UsageDetail label='Cost' value={`${formatCredits(cost)} credits`} />
          {message.model && (
            <UsageDetail label='Model' value={message.model} />
          )}
        </div>
      )}
    </div>
  );
}

function UsageDetail({ label, value }: { label: string; value: string }) {
  return (
    <span className='inline-flex items-center gap-1'>
      <span className='text-muted-foreground/60'>{label}:</span>
      <span className='font-medium text-foreground/80'>{value}</span>
    </span>
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

function hasUsage(m: AiMessage): boolean {
  return (
    (m.outputTokens ?? 0) > 0 ||
    (m.inputTokens ?? 0) > 0 ||
    (m.costCredits ?? null) !== null
  );
}

function formatTokens(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString('en-US');
}

/** Credit amounts are tiny — show enough precision without trailing noise. */
export function formatCredits(c: number): string {
  if (!c || c <= 0) return '0';
  if (c < 0.0001) return '<0.0001';
  if (c < 1) return c.toFixed(4);
  return c.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
