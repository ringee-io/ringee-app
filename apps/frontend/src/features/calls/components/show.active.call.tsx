'use client';

import { useCall } from '../hooks/use.call';
import { ActiveCallModal } from './active.call.modal';
import { useTelnyxStore } from '../store/telnyx.store';
import { useCallStore } from '../store/call.store';
import { useFreeTrialTimer } from '../hooks/use.free.trial.timer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useDialerSessionStore } from '@/features/dialer/store/dialer-session.store';

export function ShowActiveCall() {
  const dialerSessionId = useDialerSessionStore((s) => s.sessionId);
  const { activeCall, setActiveCall } = useTelnyxStore();
  const { postCallPhase, reset, setCallContact } = useCallStore();
  const api = useApi();
  const {
    isMuted,
    isOnHold,
    isRecording,
    isRecordingLoading,
    handleHangup,
    handleHold,
    handleMute,
    handleRecord,
    handleSendDTMF
  } = useCall(activeCall);

  const {
    isFreeTrialCall,
    remainingSeconds,
    totalSeconds
  } = useFreeTrialTimer(activeCall, handleHangup);

  // Contact resolution from phone number
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | undefined>(undefined);
  const resolvedNumberRef = useRef<string | null>(null);

  useEffect(() => {
    const destNumber = activeCall?.options?.destinationNumber;
    if (!destNumber || resolvedNumberRef.current === destNumber) return;

    resolvedNumberRef.current = destNumber;
    setContactId(null);
    setContactName(undefined);

    // Find or create contact by phone number
    api
      .post<{ id: string; name?: string }>('/contacts/find-or-create', {
        phoneNumber: destNumber
      })
      .then((contact) => {
        setContactId(contact.id);
        setContactName(contact.name || undefined);
      })
      .catch(() => {
        // Silently fail - contactId will remain null
      });
  }, [activeCall?.options?.destinationNumber, api]);

  // Sync resolved contact into the call store for post-call phase
  useEffect(() => {
    if (contactId) {
      setCallContact(contactId, contactName || null);
    }
  }, [contactId, contactName, setCallContact]);

  // Reset resolved number when call ends
  useEffect(() => {
    if (!activeCall && !postCallPhase) {
      resolvedNumberRef.current = null;
      setContactId(null);
      setContactName(undefined);
    }
  }, [activeCall, postCallPhase]);

  const handlePostCallClose = useCallback(() => {
    setActiveCall(null);
    reset();
  }, [setActiveCall, reset]);

  const statusText = isRecording
    ? 'Recording...'
    : activeCall?.state === 'active'
      ? 'Connected'
      : 'Connecting...';

  // Don't show the global call modal when a dialer session is active —
  // the campaign agent workspace handles the call UI.
  if (dialerSessionId) return null;

  const isOpen = !!activeCall || postCallPhase;

  return (
    <ActiveCallModal
      open={isOpen}
      isMuted={isMuted}
      isOnHold={isOnHold}
      isRecording={isRecording}
      isRecordingLoading={isRecordingLoading}
      isFreeTrialCall={isFreeTrialCall}
      freeTrialRemainingSeconds={remainingSeconds}
      freeTrialTotalSeconds={totalSeconds}
      onClose={handleHangup}
      number={activeCall?.options?.destinationNumber || '+CALL'}
      contactName={contactName}
      statusText={statusText}
      onHangup={handleHangup}
      onToggleHold={handleHold}
      onToggleMute={async () => await handleMute(!isMuted)}
      onToggleRecording={async () => await handleRecord(!isRecording)}
      onSendDTMF={handleSendDTMF}
      remoteStream={activeCall?.remoteStream ?? null}
      isPostCall={postCallPhase}
      onPostCallClose={handlePostCallClose}
      contactId={contactId}
      callId={useCallStore.getState().callId}
    />
  );
}
