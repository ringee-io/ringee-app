'use client';

import { UserButton } from '@clerk/nextjs';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { IconPlus, IconSearch, IconLink } from '@tabler/icons-react';
import { InfraContextSwitcher } from './infra-context-switcher';
import { useInfraStore } from '../store/infra.store';
import { RESOURCE_META, addResourceOptions } from '../lib/node-config';

export function InfraTopbar() {
  const { hasOrg } = useOrgRole();
  const requestAdd = useInfraStore((s) => s.requestAdd);
  const options = addResourceOptions(hasOrg);

  return (
    <header className='bg-background/80 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur'>
      <InfraContextSwitcher />

      <div className='ml-auto flex items-center gap-2'>
        {/* Search — elegant placeholder, wired in a later phase. */}
        <button
          type='button'
          disabled
          className='text-muted-foreground hover:text-foreground hidden h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs transition-colors lg:flex'
        >
          <IconSearch className='size-3.5' />
          <span>Search resources…</span>
          <kbd className='bg-background/60 ml-1 rounded border px-1.5 py-0.5 text-[10px]'>
            ⌘K
          </kbd>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size='sm' className='h-9 gap-1.5'>
              <IconPlus className='size-4' />
              <span className='hidden sm:inline'>Add resource</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-56'>
            <DropdownMenuLabel className='text-muted-foreground text-[11px] tracking-wide uppercase'>
              Add resource
            </DropdownMenuLabel>
            {options.map((opt) => {
              const meta = RESOURCE_META[opt.type];
              const Icon = meta.Icon;
              return (
                <DropdownMenuItem
                  key={opt.type}
                  onSelect={() => requestAdd(opt.type)}
                  className='gap-2.5'
                >
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-md',
                      meta.badge
                    )}
                  >
                    <Icon className='size-3.5' />
                  </span>
                  {opt.label}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => requestAdd(null)}
              className='gap-2.5'
            >
              <span className='bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-md'>
                <IconLink className='size-3.5' />
              </span>
              Link existing resource
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <UserButton afterSignOutUrl='/' />
      </div>
    </header>
  );
}
