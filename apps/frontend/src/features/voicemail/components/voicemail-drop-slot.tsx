'use client';

import { VoicemailPanel } from './voicemail-panel';
import { useVoicemailTransport } from '../hooks/use-voicemail-transport';

interface Props {
  phoneNumber: string;
  contactId?: string | null;
  callId?: string | null;
  /** Origin channel, stamped on the Call row the drop creates. */
  source?: string;
  destinationLabel?: string;
  onSent: () => void;
  onCancel?: () => void;
}

/**
 * Wires the voicemail panel to the Clerk-authenticated API. Used by every
 * in-app surface (manual dialer post-call view, campaign dialer, inbox); the
 * public session dialer supplies its own token-based transport instead.
 */
export function VoicemailDropSlot({
  phoneNumber,
  contactId,
  callId,
  source,
  destinationLabel,
  onSent,
  onCancel
}: Props) {
  const transport = useVoicemailTransport({
    phoneNumber,
    contactId,
    callId,
    source
  });

  return (
    <VoicemailPanel
      transport={transport}
      destinationLabel={destinationLabel ?? phoneNumber}
      onSent={onSent}
      onCancel={onCancel}
    />
  );
}
