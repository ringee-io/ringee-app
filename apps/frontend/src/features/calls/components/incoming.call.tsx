import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, PhoneOff } from 'lucide-react';
import { useCallback } from 'react';
import { useTelnyxStore } from '../store/telnyx.store';
import { Call } from '@telnyx/webrtc';

export function IncomingCall({
  call,
  onClose
}: {
  call: Call;
  onClose: () => void;
}) {
  const { setActiveCall, activeCall } = useTelnyxStore();

  const handleHangup = useCallback(() => {
    call?.hangup?.();
    onClose();
  }, [call]);

  const handleAnswer = useCallback(async () => {
    if (activeCall?.id === call?.id) return;

    await call?.answer?.();
    setActiveCall(call);
    onClose();
  }, [call]);

  const isCurrentCallActive = activeCall?.id === call?.id;

  return (
    <div className='bg-background flex w-[320px] flex-col gap-3 rounded-xl border p-3 shadow-lg'>
      <div className='flex items-center justify-between'>
        <div>
          <p className='text-sm font-semibold'>
            {call.options?.callerName ?? call.options?.callerNumber}
          </p>
          <p className='text-muted-foreground text-xs'>
            {call.options?.callerNumber}
          </p>
        </div>
        <span className='text-muted-foreground text-[10px]'>Incoming call</span>
      </div>

      <div className='flex justify-center gap-3'>
        <Button
          size='icon'
          variant='destructive'
          className='h-10 w-10 rounded-full'
          onClick={() => {
            handleHangup();
          }}
        >
          <PhoneOff className='h-4 w-4' />
        </Button>

        <Button
          size='icon'
          className='h-10 w-10 rounded-full bg-green-600 text-white hover:bg-green-700'
          disabled={isCurrentCallActive}
          onClick={handleAnswer}
        >
          <Phone className='h-4 w-4' />
        </Button>
      </div>
    </div>
  );
}
