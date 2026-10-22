'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Check, ChevronsUpDown, Loader2, Mail } from 'lucide-react';
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
import type { CrmMemberLink, CrmOwnerRef } from '../types/crm';

/** What the admin picked: e-mail matching, one CRM user, or nobody. */
export type CrmMemberLinkChoice =
  | { kind: 'email' }
  | { kind: 'user'; crmMemberId: string }
  | { kind: 'nobody' };

interface Props {
  link: CrmMemberLink;
  crmMembers: CrmOwnerRef[];
  /** The CRM user the member's e-mails match, shown under "by e-mail". */
  emailMatch: CrmOwnerRef | null;
  provider: string;
  saving: boolean;
  onChoose: (choice: CrmMemberLinkChoice) => void;
}

/**
 * Picks the CRM user a Ringee member is. Searchable, since a portal can have
 * hundreds of users; "by e-mail" and "nobody" come first and are always
 * there, even when the CRM's users could not be loaded.
 */
export function CrmMemberLinkPicker({
  link,
  crmMembers,
  emailMatch,
  provider,
  saving,
  onChoose
}: Props) {
  const t = useTranslations('integrations.crm.team.links');
  const [open, setOpen] = useState(false);

  const choose = (choice: CrmMemberLinkChoice) => {
    setOpen(false);
    onChoose(choice);
  };

  const selectedId =
    link.source === 'manual' ? (link.crmMember?.externalId ?? null) : null;
  const label = link.crmMember
    ? (link.crmMember.name ?? link.crmMember.email ?? link.crmMember.externalId)
    : link.source === 'manual'
      ? t('nobody')
      : t('choose', { provider });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          aria-label={t('pickerLabel', {
            member: link.name ?? link.email ?? '',
            provider
          })}
          disabled={saving}
          className={cn(
            'h-9 w-full justify-between gap-2 font-normal sm:w-64',
            !link.crmMember && 'text-muted-foreground'
          )}
        >
          <span className='min-w-0 truncate'>{label}</span>
          {saving ? (
            <Loader2 className='h-4 w-4 shrink-0 animate-spin' />
          ) : (
            <ChevronsUpDown className='h-4 w-4 shrink-0 opacity-50' />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-80 p-0'>
        <Command>
          <CommandInput placeholder={t('search', { provider })} />
          <CommandList>
            <CommandEmpty>{t('noResults')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value='__email__'
                keywords={[t('useEmail')]}
                onSelect={() => choose({ kind: 'email' })}
                className='items-start gap-2 py-2'
              >
                <Check
                  className={cn(
                    'mt-0.5',
                    link.source === 'email' ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <Mail className='text-muted-foreground mt-0.5' />
                <span className='min-w-0 flex-1'>
                  <span className='block'>{t('useEmail')}</span>
                  <span className='text-muted-foreground block truncate text-xs'>
                    {emailMatch
                      ? (emailMatch.name ?? emailMatch.email)
                      : t('noMatch', { provider })}
                  </span>
                </span>
              </CommandItem>
              <CommandItem
                value='__nobody__'
                keywords={[t('nobodyOption')]}
                onSelect={() => choose({ kind: 'nobody' })}
                className='gap-2'
              >
                <Check
                  className={cn(
                    link.source === 'manual' && !link.crmMember
                      ? 'opacity-100'
                      : 'opacity-0'
                  )}
                />
                <Ban className='text-muted-foreground' />
                {t('nobodyOption')}
              </CommandItem>
            </CommandGroup>
            {crmMembers.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t('crmUsers', { provider })}>
                  {crmMembers.map((member) => (
                    <CommandItem
                      key={member.externalId}
                      value={`${member.name ?? ''} ${member.email ?? ''} ${member.externalId}`}
                      onSelect={() =>
                        choose({ kind: 'user', crmMemberId: member.externalId })
                      }
                      className='items-start gap-2 py-2'
                    >
                      <Check
                        className={cn(
                          'mt-0.5',
                          selectedId === member.externalId
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate'>
                          {member.name ?? member.email}
                        </span>
                        {member.name && member.email && (
                          <span className='text-muted-foreground block truncate text-xs'>
                            {member.email}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
