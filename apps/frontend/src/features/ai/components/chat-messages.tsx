'use client';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconBolt, IconChevronDown, IconUser } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
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
        'bg-background ring-border/60 relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1',
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
          className='ring-primary/40 pointer-events-none absolute inset-0 animate-ping rounded-full ring-2'
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
            'max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
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
          <div className='bg-muted text-muted-foreground mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full'>
            <IconUser size={14} />
          </div>
        )}
      </div>
      {showUsage && <UsageLine message={message} />}
    </div>
  );
}

function UsageLine({ message }: { message: AiMessage }) {
  const t = useTranslations('ai.chat');
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
        className='group text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] transition-colors'
        title={t('usageTitle')}
      >
        <IconBolt size={11} className='text-amber-500' fill='currentColor' />
        <span className='tabular-nums'>
          {t('tokensIn', { count: formatTokens(input) })}
        </span>
        <span className='text-muted-foreground/50'>·</span>
        <span className='tabular-nums'>
          {t('tokensOut', { count: formatTokens(output) })}
        </span>
        <span className='text-muted-foreground/50'>·</span>
        <span className='text-foreground/80 font-medium tabular-nums'>
          {t('credits', { amount: formatCredits(cost) })}
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
        <div className='bg-muted/40 text-muted-foreground ml-1 flex flex-wrap gap-x-3 gap-y-0.5 rounded-md px-2 py-1 text-[11px]'>
          <UsageDetail
            label={t('usageInput')}
            value={t('tokensValue', { count: formatTokens(input) })}
          />
          <UsageDetail
            label={t('usageOutput')}
            value={t('tokensValue', { count: formatTokens(output) })}
          />
          {cached > 0 && (
            <UsageDetail
              label={t('usageCacheRead')}
              value={t('tokensValue', { count: formatTokens(cached) })}
            />
          )}
          {cacheWrite > 0 && (
            <UsageDetail
              label={t('usageCacheWrite')}
              value={t('tokensValue', { count: formatTokens(cacheWrite) })}
            />
          )}
          <UsageDetail
            label={t('usageCost')}
            value={t('creditsValue', { amount: formatCredits(cost) })}
          />
          {message.model && (
            <UsageDetail label={t('usageModel')} value={message.model} />
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
      <span className='text-foreground/80 font-medium'>{value}</span>
    </span>
  );
}

function ThinkingRow() {
  const t = useTranslations('ai.chat');
  return (
    <div className='flex w-full justify-start gap-2'>
      <AssistantAvatar thinking />
      <div className='bg-muted text-foreground flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm shadow-sm'>
        <span className='ringee-thinking-shimmer font-medium'>
          {t('thinking')}
        </span>
        <span
          className='text-muted-foreground flex items-center gap-1'
          aria-hidden
        >
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
