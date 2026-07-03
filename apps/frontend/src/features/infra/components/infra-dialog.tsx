'use client';

import type { ComponentType, ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription
} from '@ringee/frontend-shared/components/ui/dialog';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconLink, type IconProps } from '@tabler/icons-react';
import { RESOURCE_META } from '../lib/node-config';
import type { InfrastructureResourceType } from '../types';

/**
 * The premium modal chrome shared by every Infra create/link surface: a hero
 * header (resource icon + accent tint + title/description), a body slot, and an
 * optional sticky footer. Built on the shared Dialog so it keeps the base
 * portal/overlay/close affordance and enter animation, but re-skinned to match
 * the console (rounded-2xl, ring, grouped header/body/footer).
 */
export function InfraDialog({
  open,
  onOpenChange,
  type,
  title,
  description,
  children,
  footer,
  contentClassName
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Drives the header icon + accent. `null` = generic "link" surface. */
  type: InfrastructureResourceType | null;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
}) {
  const meta = type ? RESOURCE_META[type] : null;
  const Icon: ComponentType<IconProps> = meta?.Icon ?? IconLink;
  const badge = meta?.badge ?? 'bg-muted text-muted-foreground';
  const accent = meta?.accent ?? 'bg-primary';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'bg-card gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl ring-1 ring-white/5 sm:max-w-[520px]',
          contentClassName
        )}
      >
        {/* Hero header */}
        <div className='relative border-b px-6 pt-6 pb-5'>
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 h-24 [mask-image:linear-gradient(to_bottom,black,transparent)] opacity-[0.10]',
              accent
            )}
          />
          <div className='relative flex items-start gap-3.5'>
            <div
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-xl shadow-sm',
                badge
              )}
            >
              <Icon className='size-5.5' />
            </div>
            <div className='min-w-0 flex-1 pt-0.5 pr-6'>
              <DialogTitle className='text-lg leading-tight font-semibold tracking-tight'>
                {title}
              </DialogTitle>
              {description ? (
                <DialogDescription className='mt-1'>
                  {description}
                </DialogDescription>
              ) : null}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className='px-6 py-5'>{children}</div>

        {/* Footer */}
        {footer ? (
          <div className='bg-muted/20 border-t px-6 py-4'>{footer}</div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
