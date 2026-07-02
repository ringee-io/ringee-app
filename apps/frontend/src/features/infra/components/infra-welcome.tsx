'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  IconTopologyStar3,
  IconStack2,
  IconRouteSquare2,
  IconAdjustmentsBolt,
  IconArrowRight,
  type IconProps
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { revealVariants, staggerContainer, staggerItem } from '../lib/motion';

const POINTS: {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}[] = [
  {
    icon: IconStack2,
    title: 'Add resources',
    body: 'Numbers, campaigns, SIP devices and people.'
  },
  {
    icon: IconRouteSquare2,
    title: 'Connect them',
    body: 'Draw links to route calls end to end.'
  },
  {
    icon: IconAdjustmentsBolt,
    title: 'Manage visually',
    body: 'Configure everything from one canvas.'
  }
];

/**
 * One-time orientation for the module, shown over the canvas on the first visit.
 * Dismissible; never blocks the seeded architecture behind it.
 */
export function InfraWelcome({ onDismiss }: { onDismiss: () => void }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className='absolute inset-0 z-30 flex items-center justify-center p-6'
    >
      {/* Dimmed backdrop */}
      <button
        type='button'
        aria-label='Dismiss'
        onClick={onDismiss}
        className='bg-background/60 absolute inset-0 backdrop-blur-[2px]'
      />

      <motion.div
        initial='hidden'
        animate='visible'
        variants={reduce ? undefined : revealVariants}
        className='bg-card/90 relative w-full max-w-lg overflow-hidden rounded-3xl border shadow-2xl ring-1 ring-white/5 backdrop-blur-xl'
      >
        <div className='from-primary/[0.08] bg-gradient-to-b to-transparent px-8 pt-8 pb-6 text-center'>
          <div className='ring-primary/15 bg-primary/10 text-primary mx-auto flex size-14 items-center justify-center rounded-2xl shadow-inner ring-1'>
            <IconTopologyStar3 className='size-7' />
          </div>
          <p className='text-primary/80 mt-4 text-[11px] font-semibold tracking-[0.14em] uppercase'>
            Ringee Infra
          </p>
          <h2 className='mt-1 text-xl font-semibold tracking-tight'>
            Your calling architecture, visualized
          </h2>
          <p className='text-muted-foreground mx-auto mt-1.5 max-w-sm text-sm'>
            The visual console where you build and manage the infrastructure
            behind every call — all in one place.
          </p>
        </div>

        <motion.div
          initial='hidden'
          animate='visible'
          variants={reduce ? undefined : staggerContainer}
          className='space-y-1 px-6 py-5'
        >
          {POINTS.map((p) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                variants={reduce ? undefined : staggerItem}
                className='flex items-start gap-3 rounded-xl px-2 py-2'
              >
                <span className='bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg'>
                  <Icon className='size-4' />
                </span>
                <div>
                  <p className='text-sm font-medium'>{p.title}</p>
                  <p className='text-muted-foreground text-xs'>{p.body}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        <div className='bg-muted/20 border-t px-6 py-4'>
          <Button onClick={onDismiss} className='w-full gap-1.5'>
            Start building
            <IconArrowRight className='size-4' />
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
