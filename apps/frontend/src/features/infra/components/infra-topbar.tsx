'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import {
  IconPlus,
  IconLink,
  IconLayoutDashboard,
  IconChevronDown
} from '@tabler/icons-react';
import { InfraContextSwitcher } from './infra-context-switcher';
import { useInfraStore } from '../store/infra.store';
import { RESOURCE_META, addResourceGroups } from '../lib/node-config';

export function InfraTopbar() {
  const { hasOrg } = useOrgRole();
  const requestAdd = useInfraStore((s) => s.requestAdd);
  const groups = addResourceGroups(hasOrg);
  const pathname = usePathname();
  const onUsage = pathname.startsWith('/infra/usage');

  return (
    <header className='bg-background/70 relative flex h-16 shrink-0 items-center gap-3 border-b px-3 backdrop-blur-xl sm:px-4'>
      {/* Left — module identity */}
      <div className='hidden min-w-0 flex-col justify-center leading-tight md:flex'>
        <p className='text-foreground truncate text-sm font-semibold tracking-tight'>
          Ringee Infra
        </p>
        <p className='text-muted-foreground truncate text-[11px]'>
          {onUsage
            ? 'Usage, health & spend'
            : 'Build your call center visually'}
        </p>
      </div>

      <span className='bg-border/70 hidden h-8 w-px md:block' />

      <InfraContextSwitcher />

      {/* Right — actions */}
      <div className='ml-auto flex items-center gap-2'>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant='ghost'
              size='sm'
              className='text-muted-foreground hover:text-foreground h-9 gap-1.5'
            >
              <Link href='/dashboard'>
                <IconLayoutDashboard className='size-4' />
                <span className='hidden lg:inline'>Dashboard</span>
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side='bottom'>Back to dashboard</TooltipContent>
        </Tooltip>

        {/* "Add resource" builds the architecture — it has no place on Usage. */}
        {!onUsage ? (
          <>
            <span className='bg-border/70 hidden h-6 w-px sm:block' />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size='sm'
                  className='h-9 gap-1.5 shadow-sm shadow-emerald-500/20 transition-shadow hover:shadow-md hover:shadow-emerald-500/25'
                >
                  <IconPlus className='size-4' />
                  <span className='hidden sm:inline'>Add resource</span>
                  <IconChevronDown className='size-3.5 opacity-70' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-64'>
                {groups.map((group, gi) => (
                  <div key={group.group}>
                    {gi > 0 ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuLabel className='text-muted-foreground text-[11px] tracking-wide uppercase'>
                      {group.group}
                    </DropdownMenuLabel>
                    {group.items.map((opt) => {
                      const meta = RESOURCE_META[opt.type];
                      const Icon = meta.Icon;
                      return (
                        <DropdownMenuItem
                          key={opt.type}
                          onSelect={() => requestAdd(opt.type)}
                          className='gap-2.5 py-2'
                        >
                          <span
                            className={cn(
                              'flex size-7 items-center justify-center rounded-lg',
                              meta.badge
                            )}
                          >
                            <Icon className='size-4' />
                          </span>
                          <span className='flex-1'>{opt.label}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className='text-muted-foreground text-[11px] tracking-wide uppercase'>
                  Connections
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => requestAdd(null)}
                  className='gap-2.5 py-2'
                >
                  <span className='bg-muted text-muted-foreground flex size-7 items-center justify-center rounded-lg'>
                    <IconLink className='size-4' />
                  </span>
                  <span className='flex-1'>Link existing resource</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}

        <span className='bg-border/70 hidden h-6 w-px sm:block' />

        <UserButton afterSignOutUrl='/' />
      </div>
    </header>
  );
}
