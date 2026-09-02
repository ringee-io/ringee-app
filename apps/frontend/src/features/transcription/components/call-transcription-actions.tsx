'use client';

import { useState } from 'react';
import { TranscribeCallButton } from './transcribe-call-button';
import { TranscriptDialog } from './transcript-dialog';

interface Props {
  callId: string | null | undefined;
  className?: string;
  asMenuItem?: boolean;
  onView?: () => void;
}

export function CallTranscriptionActions({
  callId,
  className,
  asMenuItem = false,
  onView
}: Props) {
  const [open, setOpen] = useState(false);
  const ownsDialog = !onView;

  if (!callId) return null;

  return (
    <>
      <TranscribeCallButton
        callId={callId}
        mode='history'
        className={className}
        asMenuItem={asMenuItem}
        keepMenuOpenOnView={asMenuItem && ownsDialog}
        onView={onView ?? (() => setOpen(true))}
      />
      {ownsDialog ? (
        <TranscriptDialog open={open} onOpenChange={setOpen} callId={callId} />
      ) : null}
    </>
  );
}
