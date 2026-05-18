'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { IconChevronDown, IconSparkles } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import type { AiAgentDescriptor } from '../types';

interface Props {
  agents: AiAgentDescriptor[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function AgentSelector({ agents, selectedId, onSelect }: Props) {
  const t = useTranslations('ai.agents');
  const selected = agents.find((a) => a.id === selectedId) ?? agents[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm' className='gap-2'>
          <IconSparkles size={16} className='text-primary' />
          <span className='font-medium'>
            {selected?.label ?? t('selectAgent')}
          </span>
          <IconChevronDown size={14} className='opacity-60' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='w-80'>
        <DropdownMenuLabel>{t('menuLabel')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {agents.map((a) => (
          <DropdownMenuItem
            key={a.id}
            disabled={!a.active}
            onClick={() => a.active && onSelect(a.id)}
            className='flex flex-col items-start gap-0.5 py-2'
          >
            <div className='flex w-full items-center gap-2'>
              <span className='font-medium'>{a.label}</span>
              {a.active ? (
                a.id === selectedId ? (
                  <Badge variant='default' className='ml-auto text-[10px]'>
                    {t('active')}
                  </Badge>
                ) : null
              ) : (
                <Badge variant='secondary' className='ml-auto text-[10px]'>
                  {t('comingSoon')}
                </Badge>
              )}
            </div>
            <span className='text-muted-foreground line-clamp-2 text-xs'>
              {a.description}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
