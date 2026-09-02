'use client';

import { Braces, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import type { VoiceAgentVariable } from '../types';

export function PromptVariableMenu({
  variables,
  onInsert,
  label
}: {
  variables: VoiceAgentVariable[];
  onInsert: (token: string) => void;
  label?: string;
}) {
  const t = useTranslations('aiVoiceAgents.conversation.variables');
  const globalVariables: VoiceAgentVariable[] = [
    {
      key: 'agent_name',
      label: t('agentName'),
      required: true,
      description: t('agentNameDescription')
    },
    {
      key: 'company_name',
      label: t('companyName'),
      required: false,
      description: t('companyNameDescription')
    },
    {
      key: 'company_description',
      label: t('companyDescription'),
      required: false,
      description: t('companyDescriptionDescription')
    },
    {
      key: 'company_website',
      label: t('companyWebsite'),
      required: false,
      description: t('companyWebsiteDescription')
    }
  ];
  const all = [...globalVariables, ...variables].filter(
    (variable, index, list) =>
      list.findIndex((candidate) => candidate.key === variable.key) === index
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='rounded-lg'
        >
          <Braces className='size-3.5' />
          {label ?? t('add')}
          <ChevronDown className='size-3.5' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='max-h-80 w-72'>
        <DropdownMenuLabel>{t('available')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {all.map((variable) => (
          <DropdownMenuItem
            key={variable.key}
            className='cursor-pointer items-start'
            onSelect={() => onInsert(`{{${variable.key}}}`)}
          >
            <Braces className='mt-0.5 size-3.5' />
            <span className='min-w-0'>
              <span className='block font-medium'>{variable.label}</span>
              <span className='text-muted-foreground block truncate font-mono text-xs'>
                {`{{${variable.key}}}`}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
