'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import type { PickableContact } from '@/features/inbox/components/contact-picker';
import { useVoiceAgentsRail } from '../store';
import { ScheduleCallDialog } from './schedule-call-dialog';

/**
 * "Call to schedule" where the lead already is — their contact page. Shown
 * only while the workspace's scheduling agent is really available, read from
 * the summary the rail already loaded; the server checks it again on the call.
 */
export function ScheduleCallButton({ contact }: { contact: PickableContact }) {
  const t = useTranslations('aiVoiceAgents.automations.scheduleCall');
  const available = useVoiceAgentsRail(
    (state) => state.summary?.capabilities.scheduling === 'active'
  );
  const [open, setOpen] = useState(false);

  if (!available) return null;

  return (
    <>
      <Button variant='outline' size='sm' onClick={() => setOpen(true)}>
        <CalendarPlus className='mr-2 h-4 w-4' />
        {t('button')}
      </Button>
      {open ? (
        <ScheduleCallDialog
          open={open}
          onOpenChange={setOpen}
          scheduling={null}
          contact={contact}
        />
      ) : null}
    </>
  );
}
