'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconTopologyStar3, IconArrowRight } from '@tabler/icons-react';
import { RESOURCE_META, addResourceOptions } from '../lib/node-config';
import { templatesForScope, type InfraTemplate } from '../lib/templates';
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

/**
 * A tiny "how a call flows" diagram so the concept lands before the user has
 * created anything. Organization: Agent → Number → Campaign. Personal: a solo
 * operator calling from a number through a device.
 */
function flowFor(
  hasOrg: boolean
): { type: InfrastructureResourceType; label: string }[] {
  return hasOrg
    ? [
        { type: 'TEAM_MEMBER', label: 'Agent' },
        { type: 'PHONE_NUMBER', label: 'Number' },
        { type: 'CAMPAIGN', label: 'Campaign' }
      ]
    : [
        { type: 'PHONE_NUMBER', label: 'Number' },
        { type: 'SIP_DEVICE', label: 'Device' },
        { type: 'TEAM_MEMBER', label: 'You' }
      ];
}

export function EmptyState({
  hasOrg,
  onAdd,
  onTemplate
}: {
  hasOrg: boolean;
  onAdd: (type: InfrastructureResourceType) => void;
  onTemplate: (template: InfraTemplate) => void;
}) {
  const reduce = useReducedMotion();
  const options = addResourceOptions(hasOrg);
  const templates = templatesForScope(hasOrg);
  const flow = flowFor(hasOrg);

  return (
    <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6'>
      <motion.div
        initial='hidden'
        animate='visible'
        exit='exit'
        variants={reduce ? undefined : revealVariants}
        className='bg-card/80 pointer-events-auto max-h-[calc(100dvh-6rem)] w-full max-w-lg overflow-y-auto rounded-3xl border shadow-2xl ring-1 ring-white/5 backdrop-blur-xl'
      >
        {/* Header band */}
        <div className='from-primary/[0.07] relative bg-gradient-to-b to-transparent px-8 pt-8 pb-6 text-center'>
          <div className='ring-primary/15 bg-primary/10 text-primary mx-auto flex size-14 items-center justify-center rounded-2xl shadow-inner ring-1'>
            <IconTopologyStar3 className='size-7' />
          </div>
          <h2 className='mt-4 text-xl font-semibold tracking-tight'>
            Build your call center in minutes
          </h2>
          <p className='text-muted-foreground mx-auto mt-1.5 max-w-sm text-sm'>
            Start by adding a phone number, connecting agents, and launching
            your first outbound campaign — all from this canvas.
          </p>

          {/* Mini flow diagram */}
          <div className='mt-5 flex items-center justify-center gap-2'>
            {flow.map((step, i) => {
              const meta = RESOURCE_META[step.type];
              const Icon = meta.Icon;
              return (
                <div key={step.type} className='flex items-center gap-2'>
                  <div className='flex flex-col items-center gap-1'>
                    <span
                      className={cn(
                        'flex size-10 items-center justify-center rounded-xl',
                        meta.badge
                      )}
                    >
                      <Icon className='size-5' />
                    </span>
                    <span className='text-muted-foreground text-[10px] font-medium'>
                      {step.label}
                    </span>
                  </div>
                  {i < flow.length - 1 ? (
                    <IconArrowRight className='text-muted-foreground/50 mb-4 size-4 shrink-0' />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Discovery — quick adds */}
        <div className='border-t p-5'>
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
        </div>

        {/* Templates — one-click starting points */}
        <div className='bg-muted/20 border-t p-5'>
          <p className='text-muted-foreground mb-3 text-[11px] font-medium tracking-wide uppercase'>
            Or start from a template
          </p>
          <div className='flex flex-wrap gap-2'>
            {templates.map((t) => {
              const Icon = t.Icon;
              return (
                <button
                  key={t.id}
                  type='button'
                  title={t.blurb}
                  onClick={() => onTemplate(t)}
                  className='group hover:border-foreground/20 hover:bg-accent/50 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors'
                >
                  <Icon className='text-muted-foreground group-hover:text-foreground size-3.5 transition-colors' />
                  {t.label}
                </button>
              );
            })}
          </div>
          <p className='text-muted-foreground/70 mt-4 text-center text-[11px]'>
            Or right-click the canvas anywhere to add & connect resources.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
