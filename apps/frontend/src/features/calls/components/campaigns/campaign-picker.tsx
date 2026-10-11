'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Check, ChevronsUpDown, Target } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@ringee/frontend-shared/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { Campaign } from '@/features/campaigns/types/campaign.types';

/**
 * The campaign the Campaigns tab is about to call, and the way to change it:
 * the active campaigns the user may call — the server sends no other.
 */
export function CampaignPicker({
  campaigns,
  selected,
  onSelect
}: {
  campaigns: Campaign[];
  selected: Campaign;
  onSelect: (campaignId: string) => void;
}) {
  const t = useTranslations('calls.myDay.campaigns');
  const tModes = useTranslations('campaigns.modes');
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          className='h-auto max-w-full min-w-0 justify-start gap-2.5 px-2 py-1.5 text-left'
          aria-label={t('picker.change', { name: selected.name })}
        >
          <span className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'>
            <Target className='size-4' />
          </span>
          <span className='min-w-0 truncate text-base font-semibold'>
            {selected.name}
          </span>
          <ChevronsUpDown className='text-muted-foreground shrink-0' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-80 p-0'
        aria-label={t('picker.title')}
      >
        <Command>
          <CommandInput placeholder={t('picker.search')} />
          <CommandList>
            <CommandEmpty>{t('picker.noMatches')}</CommandEmpty>
            <CommandGroup heading={t('picker.title')}>
              {campaigns.map((campaign) => (
                <CommandItem
                  key={campaign.id}
                  value={`${campaign.name} ${campaign.id}`}
                  onSelect={() => {
                    onSelect(campaign.id);
                    setOpen(false);
                  }}
                  className='items-start gap-2.5 py-2'
                >
                  <Check
                    className={cn(
                      'mt-0.5',
                      campaign.id === selected.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate font-medium'>
                      {campaign.name}
                    </span>
                    <span className='text-muted-foreground block text-xs'>
                      {tModes(campaign.dialerMode)} ·{' '}
                      {t('leads', { count: campaign._count?.leads ?? 0 })}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value={t('picker.all')}
                onSelect={() => router.push('/dashboard/campaigns')}
              >
                <ArrowRight />
                {t('picker.all')}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
