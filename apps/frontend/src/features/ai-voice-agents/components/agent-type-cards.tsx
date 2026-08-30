'use client';

import Link from 'next/link';
import { CalendarCheck, BellRing, ArrowRight } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import type { VoiceAgentType, VoiceAgentTypeInfo } from '../types';

const ICONS: Record<VoiceAgentType, typeof CalendarCheck> = {
  appointment_booking: CalendarCheck,
  reminders_notifications: BellRing
};

/**
 * The two agents a user can create (§3). The copy comes from the backend so
 * the create screen and the agent's own behaviour cannot drift apart.
 */
export function AgentTypeCards({ types }: { types: VoiceAgentTypeInfo[] }) {
  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      {types.map((type) => {
        const Icon = ICONS[type.type] ?? CalendarCheck;
        return (
          <Link
            key={type.type}
            href={`/dashboard/ai-voice-agents/new?type=${type.type}`}
            className='group focus-visible:ring-ring rounded-lg focus-visible:ring-2 focus-visible:outline-none'
          >
            <Card className='hover:border-primary/50 h-full transition-colors'>
              <CardHeader>
                <div className='bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md'>
                  <Icon className='size-5' />
                </div>
                <CardTitle className='mt-3'>{type.title}</CardTitle>
                <CardDescription>{type.summary}</CardDescription>
              </CardHeader>
              <CardContent className='text-muted-foreground flex items-center gap-1 text-sm'>
                Create agent
                <ArrowRight className='size-4 transition-transform group-hover:translate-x-0.5' />
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
