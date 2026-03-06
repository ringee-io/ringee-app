'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GlassCard } from '@developer-hub/liquid-glass';

// @ts-ignore
import { motion } from 'framer-motion';

import { cn } from '../lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from './ui/popover';
import { navItems } from '../constants/data';
import { Icons } from './icons';

export function BottomLiquidNav() {
  const pathname = usePathname();

  return (
    <div className='pointer-events-none fixed inset-x-0 bottom-0 z-50 flex w-full justify-center'>
      <GlassCard
        displacementScale={120}
        blurAmount={0.015}
        cornerRadius={20}
        padding='12px 20px'
        className='bg-sidebar text-sidebar-foreground pointer-events-auto'
      >
        <nav
          aria-label='Bottom navigation'
          className='flex items-center justify-center gap-5 px-2'
        >
          {navItems.map(({ url, title: label, icon, items }) => {
            // @ts-ignore
            const Icon = Icons[icon];

            const active =
              pathname === url || (url !== '/' && pathname?.startsWith(url));

            if (items?.length) {
              return (
                <Popover key={label}>
                  <PopoverTrigger asChild>
                    <button
                      aria-label={label}
                      className='group relative flex flex-col items-center justify-center focus:outline-none'
                    >
                      <motion.div
                        animate={{
                          scale: active ? 1.1 : 1,
                          y: active ? -3 : 0
                        }}
                        transition={{
                          type: 'spring',
                          stiffness: 300,
                          damping: 20
                        }}
                        className='relative flex h-12 w-16 flex-col items-center justify-center rounded-xl transition-all duration-300 hover:brightness-105'
                      >
                        <Icon className='text-muted-foreground' />
                        <span className='text-muted-foreground mt-1 text-[11px] leading-none font-medium'>
                          {label}
                        </span>
                      </motion.div>
                    </button>
                  </PopoverTrigger>

                  <PopoverContent
                    side='top'
                    align='center'
                    className='border-none bg-transparent shadow-none'
                  >
                    <GlassCard
                      displacementScale={100}
                      blurAmount={0.015}
                      cornerRadius={16}
                      padding='10px 16px'
                      className='bg-sidebar text-sidebar-foreground min-w-[160px] space-y-1'
                    >
                      {items.map(({ url, title: label, icon }) => {
                        // @ts-ignore
                        const SubIcon = Icons[icon];
                        const active =
                          pathname === url ||
                          (url !== '/' && pathname?.startsWith(url));

                        return (
                          <Link
                            key={url}
                            href={url}
                            aria-label={label}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'flex items-center gap-3 rounded-md p-2 transition-colors',
                              active ? 'bg-primary/20' : ''
                            )}
                          >
                            <SubIcon
                              className={cn('h-6 w-6', 'text-muted-foreground')}
                            />
                            <span
                              className={cn('text-sm', 'text-muted-foreground')}
                            >
                              {label}
                            </span>
                          </Link>
                        );
                      })}
                    </GlassCard>
                  </PopoverContent>
                </Popover>
              );
            }

            return (
              <Link
                key={url}
                href={url}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className='group relative flex flex-col items-center justify-center'
              >
                <motion.div
                  animate={{
                    scale: active ? 1.1 : 1,
                    y: active ? -3 : 0
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className={cn(
                    'relative flex h-12 w-16 flex-col items-center justify-center rounded-xl transition-all duration-300',
                    active ? 'brightness-110' : 'hover:brightness-105',
                    active ? 'mx-2' : 'mx-1'
                  )}
                  style={{
                    backdropFilter: active
                      ? 'blur(8px) saturate(180%) brightness(120%)'
                      : 'none',
                    backgroundColor: active
                      ? 'rgba(255,255,255,0.1)'
                      : 'transparent',
                    border: active
                      ? '1px solid rgba(var(--primary-rgb,255,255,255),0.25)'
                      : '1px solid transparent'
                  }}
                >
                  <Icon
                    className={cn(
                      'transition-all duration-300',
                      active
                        ? 'text-md text-primary'
                        : 'text-muted-foreground text-sm'
                    )}
                  />
                  <span
                    className={cn(
                      'mt-1 text-[11px] leading-none font-medium transition-all duration-300',
                      active ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </span>
                </motion.div>
              </Link>
            );
          })}
        </nav>
      </GlassCard>
    </div>
  );
}
