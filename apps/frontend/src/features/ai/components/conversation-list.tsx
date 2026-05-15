'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconPlus } from '@tabler/icons-react';
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
  return (
    <aside className='flex h-full w-72 flex-col border-r border-border/60 bg-background/40'>
      <div className='flex items-center justify-between gap-2 border-b border-border/60 px-3 py-3'>
        <span className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
          Conversations
        </span>
        <Button
          variant='outline'
          size='sm'
          className='h-7 gap-1 px-2 text-xs'
          onClick={onNew}
        >
          <IconPlus size={14} />
          New
        </Button>
      </div>

      <div className='flex-1 overflow-y-auto'>
        {loading && conversations.length === 0 ? (
          <div className='space-y-2 px-3 py-3'>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className='h-12 animate-pulse rounded-md bg-muted/40'
              />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className='px-3 py-6 text-xs text-muted-foreground'>
            No conversations yet. Start one with the Prospecting Expert.
          </div>
        ) : (
          <ul className='px-1.5 py-2'>
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type='button'
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    'w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60',
                    activeId === c.id && 'bg-muted'
                  )}
                >
                  <div className='line-clamp-1 text-sm font-medium'>
                    {c.title ?? 'New conversation'}
                  </div>
                  <div className='line-clamp-1 text-[11px] text-muted-foreground'>
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
    </aside>
  );
}
