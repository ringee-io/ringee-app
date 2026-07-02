'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  IconTopologyStar3,
  IconStack2,
  IconRouteSquare2,
  IconAdjustmentsBolt,
  type IconProps
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { RESOURCE_META, addResourceOptions } from '../lib/node-config';
import { revealVariants, staggerContainer, staggerItem } from '../lib/motion';
import type { InfrastructureResourceType } from '../types';

/** One-liners that tell the user what each resource is for. */
const RESOURCE_BLURB: Record<InfrastructureResourceType, string> = {
  TEAM_MEMBER: 'People who place calls',
  PHONE_NUMBER: 'Numbers you call from',
  SIP_DEVICE: 'Desk phones & softphones',
  CAMPAIGN: 'Organized outbound calling',
  NUMBER_POOL: 'Rotating caller identity',
  ROUTING_RULE: 'How calls are routed',
  INTEGRATION: 'Connected tools'
};

const STEPS: { icon: ComponentType<IconProps>; title: string; body: string }[] =
  [
    {
      icon: IconStack2,
      title: 'Add resources',
      body: 'Numbers, devices, campaigns and people.'
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

export function EmptyState({
  hasOrg,
  onAdd
}: {
  hasOrg: boolean;
  onAdd: (type: InfrastructureResourceType) => void;
}) {
  const reduce = useReducedMotion();
  const options = addResourceOptions(hasOrg);

  return (
    <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6'>
      <motion.div
        initial='hidden'
        animate='visible'
        exit='exit'
        variants={reduce ? undefined : revealVariants}
        className='bg-card/80 pointer-events-auto w-full max-w-lg overflow-hidden rounded-3xl border shadow-2xl ring-1 ring-white/5 backdrop-blur-xl'
      >
        {/* Header band */}
        <div className='from-primary/[0.07] relative bg-gradient-to-b to-transparent px-8 pt-8 pb-6 text-center'>
          <div className='ring-primary/15 bg-primary/10 text-primary mx-auto flex size-14 items-center justify-center rounded-2xl shadow-inner ring-1'>
            <IconTopologyStar3 className='size-7' />
          </div>
          <h2 className='mt-4 text-xl font-semibold tracking-tight'>
            Build your calling architecture
          </h2>
          <p className='text-muted-foreground mx-auto mt-1.5 max-w-sm text-sm'>
            The visual console where you connect numbers, campaigns, SIP devices
            and people — and manage it all in one place.
          </p>
        </div>

        {/* 3-step explainer */}
        <motion.div
          initial='hidden'
          animate='visible'
          variants={reduce ? undefined : staggerContainer}
          className='grid grid-cols-3 gap-px border-y bg-white/[0.04]'
        >
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                variants={reduce ? undefined : staggerItem}
                className='bg-card/40 flex flex-col gap-1.5 px-4 py-4'
              >
                <div className='flex items-center gap-2'>
                  <span className='bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-md'>
                    <Icon className='size-3.5' />
                  </span>
                  <span className='text-muted-foreground/70 text-[11px] font-medium tabular-nums'>
                    0{i + 1}
                  </span>
                </div>
                <p className='text-xs font-semibold'>{step.title}</p>
                <p className='text-muted-foreground text-[11px] leading-snug'>
                  {step.body}
                </p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Discovery — quick adds */}
        <div className='p-5'>
          <p className='text-muted-foreground mb-3 text-[11px] font-medium tracking-wide uppercase'>
            Start with
          </p>
          <motion.div
            initial='hidden'
            animate='visible'
            variants={reduce ? undefined : staggerContainer}
            className='grid grid-cols-2 gap-2'
          >
            {options.map((opt) => {
              const meta = RESOURCE_META[opt.type];
              const Icon = meta.Icon;
              return (
                <motion.button
                  key={opt.type}
                  type='button'
                  variants={reduce ? undefined : staggerItem}
                  onClick={() => onAdd(opt.type)}
                  className={cn(
                    'group hover:border-foreground/20 hover:bg-accent/40 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
                    'hover:-translate-y-px hover:shadow-sm'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105',
                      meta.badge
                    )}
                  >
                    <Icon className='size-4.5' />
                  </span>
                  <span className='min-w-0'>
                    <span className='block truncate text-sm font-medium'>
                      {meta.label}
                    </span>
                    <span className='text-muted-foreground block truncate text-[11px]'>
                      {RESOURCE_BLURB[opt.type]}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
          <p className='text-muted-foreground/70 mt-4 text-center text-[11px]'>
            Or right-click the canvas anywhere to add & connect resources.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
