import { useHangupListener } from './use.hangup.listener';
import { useIncomingListener } from './use.incoming.listener';
import { useOutboundListener } from './use.outbound.listener';
import { useIncomingAudioListener } from './use.incoming.audio.listener';

export function useListeners() {
  useIncomingListener();
  useOutboundListener();
  useHangupListener();
  useIncomingAudioListener();
}
