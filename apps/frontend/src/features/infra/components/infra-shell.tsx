'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  IconArrowLeft,
  IconTopologyStar3,
  type IconProps
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { InfraTopbar } from './infra-topbar';

const NAV: { href: string; label: string; icon: ComponentType<IconProps> }[] = [
  { href: '/infra/overview', label: 'Architecture', icon: IconTopologyStar3 }
];

function RailButton({
  href,
  label,
  icon: Icon,
  active,
  muted
}: {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
  active?: boolean;
  muted?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={label}
          className={cn(
            'group relative flex size-10 items-center justify-center rounded-xl transition-colors',
            active
              ? 'bg-primary/15 text-primary'
              : muted
                ? 'text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.06]'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]'
          )}
        >
          {active ? (
            <span className='bg-primary absolute top-1/2 -left-2 h-5 w-1 -translate-y-1/2 rounded-full' />
          ) : null}
          <Icon className='size-[18px]' />
        </Link>
      </TooltipTrigger>
      <TooltipContent side='right'>{label}</TooltipContent>
    </Tooltip>
  );
}

export function InfraShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={200}>
      <div className='bg-background flex h-[100dvh] w-full overflow-hidden'>
        {/* Slim tool rail */}
        <aside className='bg-card/40 flex w-16 shrink-0 flex-col items-center gap-1 border-r py-3'>
          <Link
            href='/infra/overview'
            aria-label='Ringee Infra'
            className='bg-primary text-primary-foreground mb-2 flex size-10 items-center justify-center rounded-xl shadow-sm'
          >
            <IconTopologyStar3 className='size-5' />
          </Link>

          <nav className='flex flex-1 flex-col items-center gap-1'>
            {NAV.map((item) => (
              <RailButton
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={pathname.startsWith(item.href)}
              />
            ))}
          </nav>

          <RailButton
            href='/dashboard'
            label='Back to app'
            icon={IconArrowLeft}
            muted
          />
        </aside>

        {/* Main column */}
        <div className='flex min-w-0 flex-1 flex-col'>
          <InfraTopbar />
          {/* The canvas owns its own pan/zoom, so it just fills the column. */}
          <div className='relative min-h-0 flex-1 overflow-hidden'>
            {children}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
