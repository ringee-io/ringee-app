'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  IconChevronDown,
  IconMessageCircle2,
  IconPlus
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { AiConversation } from '../types';

interface Props {
  conversations: AiConversation[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function ConversationList({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew
}: Props) {
  const t = useTranslations('ai.conversations');
  const [open, setOpen] = useState(false);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  function handleSelect(id: string) {
    onSelect(id);
    setOpen(false);
  }

  function handleNew() {
    onNew();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className='h-9 max-w-[14rem] gap-2 pr-2'
        >
          <IconMessageCircle2 size={16} className='text-muted-foreground' />
          <span className='truncate text-sm font-medium'>
            {active?.title ?? t('title')}
          </span>
          {conversations.length > 0 && (
            <span className='bg-muted text-muted-foreground ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold'>
              {conversations.length}
            </span>
          )}
          <IconChevronDown size={14} className='opacity-60' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-80 p-0'>
        <div className='border-border/60 flex items-center justify-between gap-2 border-b px-3 py-2.5'>
          <span className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            {t('title')}
          </span>
          <Button
            variant='outline'
            size='sm'
            className='h-7 gap-1 px-2 text-xs'
            onClick={handleNew}
          >
            <IconPlus size={14} />
            {t('new')}
          </Button>
        </div>

        <div className='max-h-[60vh] overflow-y-auto'>
          {loading && conversations.length === 0 ? (
            <div className='space-y-2 px-3 py-3'>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className='bg-muted/40 h-12 animate-pulse rounded-md'
                />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className='text-muted-foreground px-3 py-6 text-xs'>
              {t('empty')}
            </div>
          ) : (
            <ul className='px-1.5 py-2'>
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type='button'
                    onClick={() => handleSelect(c.id)}
                    className={cn(
                      'hover:bg-muted/60 w-full rounded-md px-2 py-2 text-left transition-colors',
                      activeId === c.id && 'bg-muted'
                    )}
                  >
                    <div className='line-clamp-1 text-sm font-medium'>
                      {c.title ?? t('untitled')}
                    </div>
                    <div className='text-muted-foreground line-clamp-1 text-[11px]'>
                      {c.lastMessageAt
                        ? new Date(c.lastMessageAt).toLocaleString()
                        : new Date(c.createdAt).toLocaleString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
