'use client';

import { useState } from 'react';
import { TranscribeCallButton } from './transcribe-call-button';
import { TranscriptDialog } from './transcript-dialog';

interface Props {
  callId: string | null | undefined;
  className?: string;
  asMenuItem?: boolean;
}

export function CallTranscriptionActions({
  callId,
  className,
  asMenuItem = false
}: Props) {
  const [open, setOpen] = useState(false);

  if (!callId) return null;

  return (
    <>
      <TranscribeCallButton
        callId={callId}
        mode='history'
        className={className}
        asMenuItem={asMenuItem}
        onView={() => setOpen(true)}
      />
      <TranscriptDialog open={open} onOpenChange={setOpen} callId={callId} />
    </>
  );
}
