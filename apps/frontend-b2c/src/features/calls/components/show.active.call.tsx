import { useCall } from '../hooks/use.call';
import { ActiveCallModal } from './active.call.modal';
import { useTelnyxStore } from '../store/telnyx.store';
import { useFreeTrialTimer } from '../hooks/use.free.trial.timer';

export function ShowActiveCall() {
  const { activeCall } = useTelnyxStore();
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

  const statusText = isRecording
    ? 'Recording...'
    : activeCall?.state === 'active'
      ? 'Connected'
      : 'Connecting...';

  return (
    <ActiveCallModal
      open={!!activeCall}
      isMuted={isMuted}
      isOnHold={isOnHold}
      isRecording={isRecording}
      isRecordingLoading={isRecordingLoading}
      isFreeTrialCall={isFreeTrialCall}
      freeTrialRemainingSeconds={remainingSeconds}
      freeTrialTotalSeconds={totalSeconds}
      onClose={handleHangup}
      number={activeCall?.options?.destinationNumber || '+CALL'}
      statusText={statusText}
      onHangup={handleHangup}
      onToggleHold={handleHold}
      onToggleMute={async () => await handleMute(!isMuted)}
      onToggleRecording={async () => await handleRecord(!isRecording)}
      onSendDTMF={handleSendDTMF}
      remoteStream={activeCall?.remoteStream ?? null}
    />
  );
}
