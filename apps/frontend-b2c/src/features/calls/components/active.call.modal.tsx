'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Avatar, AvatarFallback } from '@ringee/frontend-shared/components/ui/avatar';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  Mic,
  MicOff,
  Pause,
  Play,
  PhoneOff,
  Radio,
  Volume2,
  Circle,
  Disc as RecordIcon,
  Disc3 as RecordingPulse,
  Loader2
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import { IconKeyboard } from '@tabler/icons-react';

type ActiveCallModalProps = {
  open: boolean;
  onClose: () => void;

  /** display */
  number: string;
  contactName?: string;
  statusText?: string;

  /** states from parent (authoritative) */
  isMuted?: boolean;
  isOnHold?: boolean;
  isRecording?: boolean;
  isRecordingLoading?: boolean;

  /** actions wired to Telnyx call */
  onHangup: () => void;
  onToggleMute: () => Promise<void>;
  onToggleHold: () => Promise<void>;
  onToggleRecording: () => Promise<void>;

  /** optional media stream (for in-modal playback/visuals) */
  remoteStream?: MediaStream | null;

  /** optional DTMF sender */
  onSendDTMF?: (digit: string) => void;
};

export function ActiveCallModal({
  open,
  onClose,
  number,
  contactName,
  statusText = 'Connecting...',
  isMuted = false,
  isOnHold = false,
  isRecording = false,
  isRecordingLoading = false,
  onHangup,
  onToggleMute,
  onToggleHold,
  onToggleRecording,
  remoteStream,
  onSendDTMF
}: ActiveCallModalProps) {
  const [elapsed, setElapsed] = useState(0);
  const [dtmfDigits, setDtmfDigits] = useState<string[]>([]);

  const handlePressDTMF = (digit: string) => {
    playDTMFTone(digit);

    onSendDTMF?.(digit);
    setDtmfDigits((prev) => [...prev, digit]);
  };

  function playDTMFTone(digit: string) {
    const ctx = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    const freqs: Record<string, [number, number]> = {
      '1': [697, 1209],
      '2': [697, 1336],
      '3': [697, 1477],
      '4': [770, 1209],
      '5': [770, 1336],
      '6': [770, 1477],
      '7': [852, 1209],
      '8': [852, 1336],
      '9': [852, 1477],
      '*': [941, 1209],
      '0': [941, 1336],
      '#': [941, 1477]
    };
    const [f1, f2] = freqs[digit] || [];
    if (!f1 || !f2) return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.frequency.value = f1;
    osc2.frequency.value = f2;
    gain.gain.value = 0.12;

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    setTimeout(() => {
      osc1.stop();
      osc2.stop();
      ctx.close();
    }, 180); // duración corta tipo DTMF
  }

  useEffect(() => {
    if (!open) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  const elapsedLabel = useMemo(() => {
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [elapsed]);

  return (
    <Dialog modal={false} open={open} onOpenChange={onClose}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className={cn(
          'h-[90vh] w-[95vw] max-w-[960px]',
          'flex flex-col justify-between rounded-2xl p-6',
          'from-background via-muted/60 to-background bg-gradient-to-b',
          'border-border/40 overflow-hidden border shadow-2xl',
          // BACKDROP BLUR
          'backdrop-blur-md'
        )}
      >
        <DialogHeader>
          <DialogTitle className='flex flex-col items-center gap-3 text-center'>
            <Avatar className='h-20 w-20'>
              <AvatarFallback className='text-xl font-semibold'>
                {contactName?.charAt(0) ??
                  number?.replace('+', '').charAt(0) ??
                  'R'}
              </AvatarFallback>
            </Avatar>

            <div className='space-y-1'>
              <h3 className='text-lg font-semibold'>{contactName || number}</h3>
              <p className='text-muted-foreground text-sm'>{statusText}</p>
              <p className='text-muted-foreground text-xs'>{elapsedLabel}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Media / Visual */}
        <div className='flex flex-1 items-center justify-center'>
          <div className='relative flex h-36 w-full max-w-xl items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400/10 via-cyan-400/10 to-transparent'>
            <Radio className='h-10 w-10 animate-pulse text-emerald-400' />
            {remoteStream && (
              <audio
                autoPlay
                playsInline
                className='hidden'
                ref={(el) => {
                  if (el && remoteStream) {
                    el.srcObject = remoteStream;
                  }
                }}
              />
            )}
          </div>
        </div>

        <Separator className='my-4 opacity-20' />

        {/* Controls */}
        <TooltipProvider delayDuration={100}>
          <div className='grid grid-cols-5 place-items-center gap-4'>
            {/* Mute */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  size='lg'
                  onClick={onToggleMute}
                  className={cn(
                    'h-14 w-14 rounded-full',
                    isMuted && 'bg-red-500/10 text-red-500'
                  )}
                >
                  {isMuted ? (
                    <MicOff className='h-5 w-5' />
                  ) : (
                    <Mic className='h-5 w-5' />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side='top'>
                {' '}
                {isMuted ? 'Unmute' : 'Mute'}{' '}
              </TooltipContent>
            </Tooltip>

            {/* Hold / Resume */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  size='lg'
                  onClick={onToggleHold}
                  className={cn(
                    'h-14 w-14 rounded-full',
                    isOnHold && 'bg-yellow-500/10 text-yellow-500'
                  )}
                >
                  {isOnHold ? (
                    <Play className='h-5 w-5' />
                  ) : (
                    <Pause className='h-5 w-5' />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side='top'>
                {isOnHold ? 'Resume' : 'Hold'}
              </TooltipContent>
            </Tooltip>

            {/* Hangup */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size='lg'
                  onClick={onHangup}
                  className='h-16 w-16 rounded-full bg-red-600 text-white hover:bg-red-700'
                >
                  <PhoneOff className='h-6 w-6' />
                </Button>
              </TooltipTrigger>
              <TooltipContent side='top'>Hang up</TooltipContent>
            </Tooltip>

            {/* Recording */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  size='lg'
                  onClick={onToggleRecording}
                  className={cn(
                    'h-14 w-14 rounded-full transition-colors',
                    isRecording && 'bg-rose-500/10 text-rose-500'
                  )}
                >
                  {isRecordingLoading ? (
                    <Loader2 className='h-5 w-5 animate-spin' />
                  ) : isRecording ? (
                    <RecordingPulse className='h-5 w-5 animate-pulse' />
                  ) : (
                    <RecordIcon className='h-5 w-5' />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side='top'>
                {isRecording
                  ? 'Stop recording'
                  : 'Call recordings may have a extra cost'}
              </TooltipContent>
            </Tooltip>

            {/* KeyPad */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant='ghost'
                      size='lg'
                      className='h-14 w-14 rounded-full text-emerald-400'
                    >
                      <IconKeyboard className='h-5 w-5' />
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent
                    side='top'
                    align='center'
                    className='flex w-64 flex-col items-center space-y-3 p-3'
                  >
                    <div className='grid grid-cols-3 gap-2'>
                      {[
                        '1',
                        '2',
                        '3',
                        '4',
                        '5',
                        '6',
                        '7',
                        '8',
                        '9',
                        '*',
                        '0',
                        '#'
                      ].map((d) => (
                        <button
                          key={d}
                          onClick={() => handlePressDTMF(d)}
                          className='bg-muted/60 hover:bg-accent active:bg-accent/40 flex h-12 w-16 flex-col items-center justify-center rounded-lg text-lg font-semibold transition-all active:scale-95'
                        >
                          {d}
                        </button>
                      ))}
                    </div>

                    {dtmfDigits.length > 0 && (
                      <div className='text-muted-foreground mt-2 w-full text-center font-mono text-sm'>
                        Sent: {dtmfDigits.join(' ')}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </TooltipTrigger>
              <TooltipContent>Send DTMF</TooltipContent>
            </Tooltip>

            {/* Output Volume (placeholder UI) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  size='lg'
                  className='h-14 w-14 rounded-full'
                >
                  <Volume2 className='h-5 w-5 text-emerald-400' />
                </Button>
              </TooltipTrigger>
              <TooltipContent side='top'>Output volume</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        <div className='text-muted-foreground mt-3 flex items-center justify-center gap-2 text-xs'>
          <Circle
            className={cn(
              'h-2 w-2',
              isRecording ? 'text-rose-500' : 'text-emerald-400'
            )}
          />
          <span>
            Secure via <span className='text-emerald-400'>Ringee Voice</span>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
