'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  IconArrowLeft,
  IconChartHistogram,
  IconTopologyStar3,
  type IconProps
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { SPRING } from '../lib/motion';
import { InfraTopbar } from './infra-topbar';

const NAV: { href: string; label: string; icon: ComponentType<IconProps> }[] = [
  { href: '/infra/overview', label: 'Architecture', icon: IconTopologyStar3 },
  { href: '/infra/usage', label: 'Usage', icon: IconChartHistogram }
];

function RailButton({
  href,
  label,
  icon: Icon,
  active,
  reduce
}: {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
  active?: boolean;
  reduce?: boolean | null;
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
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {active ? (
            <motion.span
              layoutId='infra-rail-active'
              transition={reduce ? { duration: 0 } : SPRING}
              className='bg-primary/15 ring-primary/20 absolute inset-0 rounded-xl ring-1'
            />
          ) : (
            <span className='absolute inset-0 rounded-xl transition-colors group-hover:bg-white/[0.06]' />
          )}
          <Icon className='relative size-[18px] transition-transform duration-150 group-hover:scale-110' />
        </Link>
      </TooltipTrigger>
      <TooltipContent side='right'>{label}</TooltipContent>
    </Tooltip>
  );
}

export function InfraShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <TooltipProvider delayDuration={200}>
      <div className='bg-background flex h-[100dvh] w-full overflow-hidden'>
        {/* Slim tool rail */}
        <aside className='bg-card/40 flex w-16 shrink-0 flex-col items-center gap-1.5 border-r py-3'>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href='/infra/overview'
                aria-label='Ringee Infra'
                className='from-primary to-primary/85 text-primary-foreground shadow-primary/20 group flex size-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg ring-1 ring-white/10'
              >
                <IconTopologyStar3 className='size-5 transition-transform duration-200 group-hover:scale-110' />
              </Link>
            </TooltipTrigger>
            <TooltipContent side='right'>Ringee Infra</TooltipContent>
          </Tooltip>

          <span className='bg-border/70 my-1 h-px w-6' />

          <nav className='flex flex-1 flex-col items-center gap-1.5'>
            {NAV.map((item) => (
              <RailButton
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={pathname.startsWith(item.href)}
                reduce={reduce}
              />
            ))}
          </nav>

          <span className='bg-border/70 my-1 h-px w-6' />

          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href='/dashboard'
                aria-label='Back to dashboard'
                className='text-muted-foreground hover:text-foreground hover:border-foreground/20 group flex size-10 items-center justify-center rounded-xl border border-transparent transition-colors hover:bg-white/[0.04]'
              >
                <IconArrowLeft className='size-[18px] transition-transform duration-150 group-hover:-translate-x-0.5' />
              </Link>
            </TooltipTrigger>
            <TooltipContent side='right'>Back to dashboard</TooltipContent>
          </Tooltip>
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
