'use client';

import Link from 'next/link';
import { ArrowRight, BellRing, CalendarCheck } from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { VoiceAgentType, VoiceAgentTypeInfo } from '../types';

const ICONS: Record<VoiceAgentType, typeof CalendarCheck> = {
  appointment_booking: CalendarCheck,
  reminders_notifications: BellRing
};

/**
 * The agent types a user can create. The copy comes from the backend, so the
 * card and the agent's own behaviour cannot drift apart.
 */
export function AgentTypeCards({
  types,
  className
}: {
  types: VoiceAgentTypeInfo[];
  className?: string;
}) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {types.map((type) => {
        const Icon = ICONS[type.type] ?? CalendarCheck;
        return (
          <Link
            key={type.type}
            href={`/dashboard/ai-voice-agents/new?type=${type.type}`}
            className='group hover:border-primary/50 hover:bg-muted/40 focus-visible:ring-ring flex flex-col rounded-lg border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none'
          >
            <div className='bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg'>
              <Icon className='size-5' />
            </div>
            <p className='mt-3 font-medium'>{type.title}</p>
            <p className='text-muted-foreground mt-1 flex-1 text-sm'>
              {type.summary}
            </p>
            <span className='text-primary mt-3 flex items-center gap-1 text-sm font-medium'>
              Create
              <ArrowRight className='size-4 transition-transform group-hover:translate-x-0.5' />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
