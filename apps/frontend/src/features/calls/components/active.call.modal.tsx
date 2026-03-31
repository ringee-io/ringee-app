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
import { ScrollArea } from '@ringee/frontend-shared/components/ui/scroll-area';
import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  Mic,
  MicOff,
  Pause,
  Play,
  PhoneOff,
  Radio,
  CalendarPlus,
  Circle,
  Disc as RecordIcon,
  Disc3 as RecordingPulse,
  Loader2,
  Clock,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PostCallView } from './post-call.view';
import { BookMeetingForm } from './book-meeting.form';
import { useCallStore } from '../store/call.store';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { IconKeyboard } from '@tabler/icons-react';
import { ContactActivities } from './contact-activities';

type ActiveCallModalProps = {
  open: boolean;
  onClose: () => void;

  number: string;
  contactName?: string;
  statusText?: string;

  isMuted?: boolean;
  isOnHold?: boolean;
  isRecording?: boolean;
  isRecordingLoading?: boolean;

  isFreeTrialCall?: boolean;
  freeTrialRemainingSeconds?: number;
  freeTrialTotalSeconds?: number;

  onHangup: () => void;
  onToggleMute: () => Promise<void>;
  onToggleHold: () => Promise<void>;
  onToggleRecording: () => Promise<void>;

  remoteStream?: MediaStream | null;
  onSendDTMF?: (digit: string) => void;

  isPostCall?: boolean;
  onPostCallClose: () => void;

  contactId?: string | null;
  callId?: string | null;
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
  isFreeTrialCall = false,
  freeTrialRemainingSeconds = 60,
  freeTrialTotalSeconds = 60,
  remoteStream,
  onSendDTMF,
  isPostCall = false,
  onPostCallClose,
  contactId,
  callId
}: ActiveCallModalProps) {
  const [elapsed, setElapsed] = useState(0);
  const [dtmfDigits, setDtmfDigits] = useState<string[]>([]);
  const { bookingPanelOpen, setBookingPanelOpen, meetingBooked, setMeetingBooked } =
    useCallStore();
  const [activeTab, setActiveTab] = useState<'activities' | 'booking'>('activities');

  useEffect(() => {
    if (bookingPanelOpen) setActiveTab('booking');
  }, [bookingPanelOpen]);

  const handlePressDTMF = (digit: string) => {
    playDTMFTone(digit);
    onSendDTMF?.(digit);
    setDtmfDigits((prev) => [...prev, digit]);
  };

  function playDTMFTone(digit: string) {
    const ctx = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    const freqs: Record<string, [number, number]> = {
      '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
      '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
      '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
      '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
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
    }, 180);
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

  const trialLabel = useMemo(() => {
    const m = Math.floor(freeTrialRemainingSeconds / 60);
    const s = freeTrialRemainingSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [freeTrialRemainingSeconds]);

  const trialProgress = freeTrialTotalSeconds > 0
    ? ((freeTrialTotalSeconds - freeTrialRemainingSeconds) / freeTrialTotalSeconds) * 100
    : 0;

  // --- POST-CALL VIEW ---
  if (isPostCall) {
    return (
      <Dialog modal={false} open={open} onOpenChange={() => {}}>
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={cn(
            'w-[95vw] max-w-[480px]',
            'flex flex-col rounded-2xl p-5',
            'bg-background',
            'border-border/60 overflow-hidden border shadow-xl'
          )}
        >
          <PostCallView onClose={onPostCallClose} />
        </DialogContent>
      </Dialog>
    );
  }

  // --- ACTIVE CALL VIEW ---
  const isConnected = statusText === 'Connected' || elapsed > 0;

  return (
    <Dialog modal={false} open={open} onOpenChange={onClose}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className={cn(
          'p-0 w-[95vw] shadow-2xl rounded-xl overflow-hidden border border-border/20 bg-[#0A0A0A] flex flex-col',
          (contactId || bookingPanelOpen) ? '!max-w-5xl h-[90vh] md:h-[85vh] min-h-[600px]' : '!max-w-md min-h-[500px]',
          'transition-all duration-500 ease-in-out'
        )}
      >
        {/* Free trial banner */}
        {isFreeTrialCall && (
          <div className='bg-amber-500/10 px-4 py-2 shrink-0 relative overflow-hidden border-b border-amber-500/20'>
            <div className='flex items-center justify-between relative z-10'>
              <div className='flex items-center gap-1.5'>
                <Clock className='h-3.5 w-3.5 text-amber-600' />
                <span className='text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-700'>
                  Free Trial &middot; 1 min limit
                </span>
              </div>
              <span
                className={cn(
                  'font-mono text-[10px] sm:text-xs font-bold tabular-nums',
                  freeTrialRemainingSeconds <= 10
                    ? 'animate-pulse text-red-600'
                    : 'text-amber-700'
                )}
              >
                {trialLabel}
              </span>
            </div>
            <div className='absolute bottom-0 left-0 h-[3px] w-full bg-amber-500/20'>
              <div
                className={cn(
                  'h-full transition-all duration-1000 ease-linear',
                  freeTrialRemainingSeconds <= 10 ? 'bg-red-500' : 'bg-amber-500'
                )}
                style={{ width: `${trialProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className='flex flex-col md:flex-row h-full w-full relative flex-1 overflow-y-auto md:overflow-hidden'>
          {/* LEFT PANEL: The Call Engine */}
          <div className={cn(
            'relative flex flex-col items-center justify-between pb-6 md:pb-8 pt-6 md:pt-10 shrink-0 transition-all duration-500',
            (contactId || bookingPanelOpen) ? 'w-full md:w-[45%] border-b md:border-b-0 md:border-r border-border/20 bg-muted/5 min-h-[500px] md:min-h-0' : 'w-full min-h-[500px]'
          )}>
            {/* Background decorative glow */}
            <div className={cn(
              'absolute top-0 left-0 right-0 h-48 md:h-64 opacity-20 pointer-events-none transition-colors duration-1000 -z-10 bg-gradient-to-b to-transparent',
              isConnected ? 'from-emerald-500/40' : 'from-primary/30'
            )} />

            {/* Caller ID Section */}
            <div className='flex flex-col items-center z-10 w-full px-6 md:px-8 shrink-0'>
              <div className='relative'>
                <Avatar className={cn(
                  'border-4 border-[#0A0A0A] shadow-xl transition-all duration-700',
                  (contactId || bookingPanelOpen) ? 'h-20 w-20 md:h-24 md:w-24' : 'h-28 w-28 md:h-32 md:w-32',
                  isConnected ? 'ring-4 ring-emerald-500/20 shadow-emerald-500/20' : 'ring-4 ring-border/20'
                )}>
                  <AvatarFallback className='text-3xl md:text-4xl font-light bg-gradient-to-br from-primary/20 to-primary/5 text-primary'>
                    {contactName?.charAt(0) ?? number?.replace('+', '').charAt(0) ?? 'R'}
                  </AvatarFallback>
                </Avatar>
                {/* Recording Indicator */}
                {isRecording && (
                  <div className='absolute -bottom-1 -right-1 bg-rose-500 text-white text-[8px] md:text-[9px] uppercase tracking-widest font-black px-1.5 md:px-2 py-0.5 rounded-full shadow-lg border-2 border-background animate-pulse'>
                    REC
                  </div>
                )}
              </div>

              <h2 className={cn('font-bold tracking-tight text-foreground text-center line-clamp-1 transition-all', (contactId || bookingPanelOpen) ? 'mt-3 text-lg md:mt-4 md:text-xl' : 'mt-4 text-2xl md:mt-6 md:text-3xl')}>
                {contactName || number}
              </h2>
              
              <div className='mt-2 flex items-center justify-center gap-1.5 md:gap-2'>
                <span className={cn(
                  'h-1.5 w-1.5 md:h-2 md:w-2 rounded-full',
                  isRecording ? 'bg-rose-500 animate-pulse' : isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-primary/60'
                )} />
                <span className={cn(
                  'text-xs md:text-sm font-semibold tracking-wide uppercase',
                  isRecording ? 'text-rose-500' : isConnected ? 'text-emerald-600' : 'text-muted-foreground'
                )}>
                  {meetingBooked ? 'MEETING BOOKED' : isRecording ? 'RECORDING' : statusText}
                </span>
              </div>

              <div className={cn('font-mono font-light tabular-nums tracking-tighter opacity-80 transition-all', (contactId || bookingPanelOpen) ? 'mt-2 text-2xl md:mt-3 md:text-3xl' : 'mt-3 text-4xl md:mt-5 md:text-5xl')}>
                {elapsedLabel}
              </div>
            </div>

            {/* Visualizer / Center Space */}
            <div className='flex-1 w-full flex items-center justify-center relative z-10 min-h-[80px] md:min-h-[100px]'>
              {isConnected ? (
                <div className='relative flex h-12 w-24 md:h-16 md:w-32 items-center justify-center gap-1 md:gap-1.5'>
                  {remoteStream && (
                    <audio
                      autoPlay
                      playsInline
                      className='hidden'
                      ref={(el) => {
                        if (el && remoteStream) el.srcObject = remoteStream;
                      }}
                    />
                  )}
                  {/* Fake waveform bars */}
                  {[0.8, 0.4, 1, 0.6, 0.9, 0.5, 0.7].map((height, i) => (
                    <div
                      key={i}
                      className='w-1 md:w-1.5 rounded-full bg-emerald-500/40 animate-pulse'
                      style={{ height: `${height * 100}%`, animationDuration: `${0.5 + i * 0.1}s` }}
                    />
                  ))}
                </div>
              ) : (
                <Radio className='h-8 w-8 md:h-12 md:w-12 text-primary/20 animate-pulse' />
              )}
            </div>

            {/* Controls Section */}
            <div className='z-10 flex flex-col items-center w-full px-4 md:px-6 shrink-0'>
              <div className='flex items-center justify-center gap-1 md:gap-1.5 bg-background/80 backdrop-blur-xl border border-border/50 shadow-sm rounded p-1.5 md:p-2 mb-4 md:mb-6'>
                {/* Mute */}
                <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                  <Button variant='ghost' size='icon' onClick={onToggleMute} className={cn('h-12 w-12 md:h-14 md:w-14 rounded transition-all', isMuted ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25' : 'hover:bg-muted/50')}>
                    {isMuted ? <MicOff className='h-5 w-5 md:h-6 md:w-6' /> : <Mic className='h-5 w-5 md:h-6 md:w-6' />}
                  </Button>
                </TooltipTrigger><TooltipContent>Mute</TooltipContent></Tooltip></TooltipProvider>

                {/* Keypad */}
                <Popover>
                  <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button variant='ghost' size='icon' className='h-12 w-12 md:h-14 md:w-14 rounded hover:bg-muted/50 transition-all'>
                        <IconKeyboard className='h-5 w-5 md:h-6 md:w-6 text-foreground/80' />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger><TooltipContent>Keypad</TooltipContent></Tooltip></TooltipProvider>
                  <PopoverContent side='top' align='center' className='w-64 p-4 rounded shadow-xl'>
                    <div className='grid grid-cols-3 gap-2'>
                      {['1','2','3','4','5','6','7','8','9','*','0','#'].map((d) => (
                        <button
                          key={d}
                          onClick={() => handlePressDTMF(d)}
                          className='bg-muted/40 hover:bg-primary hover:text-primary-foreground active:scale-90 flex h-12 md:h-14 items-center justify-center rounded text-xl font-medium transition-all'
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    {dtmfDigits.length > 0 && (
                      <div className='mt-3 text-center font-mono text-sm tracking-widest text-primary font-semibold bg-primary/10 py-1.5 rounded'>
                        {dtmfDigits.join(' ')}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>

                {/* Hold */}
                <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                  <Button variant='ghost' size='icon' onClick={onToggleHold} className={cn('h-12 w-12 md:h-14 md:w-14 rounded transition-all', isOnHold ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25' : 'hover:bg-muted/50')}>
                    {isOnHold ? <Play className='h-5 w-5 md:h-6 md:w-6' /> : <Pause className='h-5 w-5 md:h-6 md:w-6 text-foreground/80' />}
                  </Button>
                </TooltipTrigger><TooltipContent>{isOnHold ? 'Resume' : 'Hold'}</TooltipContent></Tooltip></TooltipProvider>

                {/* Record */}
                <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                  <Button variant='ghost' size='icon' onClick={onToggleRecording} className={cn('h-12 w-12 md:h-14 md:w-14 rounded transition-all', isRecording ? 'bg-rose-500/15 text-rose-600 hover:bg-rose-500/25' : 'hover:bg-muted/50')}>
                    {isRecordingLoading ? <Loader2 className='h-5 w-5 md:h-6 md:w-6 animate-spin' /> : isRecording ? <RecordingPulse className='h-5 w-5 md:h-6 md:w-6 animate-pulse' /> : <RecordIcon className='h-5 w-5 md:h-6 md:w-6 text-foreground/80' />}
                  </Button>
                </TooltipTrigger><TooltipContent>{isRecording ? 'Stop Recording' : 'Record'}</TooltipContent></Tooltip></TooltipProvider>
                
                {/* Book Meeting (If no right panel) */}
                {!(contactId || bookingPanelOpen) && (
                  <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                    <Button variant='ghost' size='icon' onClick={() => setBookingPanelOpen(true)} className='h-12 w-12 md:h-14 md:w-14 rounded hover:bg-emerald-500/10 text-emerald-600 transition-all'>
                      <CalendarPlus className='h-5 w-5 md:h-6 md:w-6' />
                    </Button>
                  </TooltipTrigger><TooltipContent>Book Meeting</TooltipContent></Tooltip></TooltipProvider>
                )}
              </div>

              {/* Secure via */}
              <div className='text-muted-foreground mb-3 md:mb-4 flex items-center justify-center gap-1.5 text-[9px] md:text-[10px] font-medium uppercase tracking-widest opacity-60'>
                <Circle className={cn('h-1.5 w-1.5', isRecording ? 'text-rose-500' : 'text-emerald-500')} />
                Secure via <span className='text-emerald-500'>Ringee Voice</span>
              </div>

              <Button 
                size='sm' 
                onClick={onHangup} 
                className='h-14 md:h-16 w-full max-w-[280px] md:max-w-[320px] rounded-xl bg-rose-500 hover:bg-rose-600 text-white shadow-xl shadow-rose-500/20 text-base md:text-lg font-bold gap-2 md:gap-3 transition-all hover:scale-[1.02] active:scale-95'
              >
                <PhoneOff className='h-5 w-5 md:h-6 md:w-6' />
                END CALL
              </Button>
            </div>
          </div>

          {/* RIGHT PANEL: Intelligence */}
          {(contactId || bookingPanelOpen) && (
            <div className='w-full md:w-[55%] h-[500px] md:h-full flex flex-col bg-[#0A0A0A] shrink-0 border-l border-border/10 z-20'>
              {/* Header area */}
              <div className='px-4 md:px-6 py-3 md:py-4 flex items-center justify-between border-b border-border/10 shrink-0'>
                {contactId ? (
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className='w-full'>
                    <TabsList className='flex items-center gap-1.5 bg-transparent p-0 h-auto justify-start border-none'>
                      <TabsTrigger 
                        value='activities' 
                        className='rounded-xl border border-transparent data-[state=active]:border-border/30 data-[state=active]:bg-white/5 shadow-none bg-transparent px-3 py-1.5 text-xs md:text-sm font-normal text-muted-foreground data-[state=active]:text-foreground transition-all'
                      >
                        History
                      </TabsTrigger>
                      <TabsTrigger 
                        value='booking' 
                        className='rounded-xl border border-transparent data-[state=active]:border-border/30 data-[state=active]:bg-white/5 shadow-none bg-transparent px-3 py-1.5 text-xs md:text-sm font-normal text-muted-foreground data-[state=active]:text-foreground transition-all'
                      >
                        Book Meeting
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                ) : (
                  <h3 className='text-base md:text-lg font-bold text-foreground'>Book Meeting</h3>
                )}
                
                {bookingPanelOpen && !contactId && (
                  <Button variant='ghost' size='icon' onClick={() => setBookingPanelOpen(false)} className='rounded-xl h-8 w-8 md:h-10 md:w-10 bg-transparent hover:bg-white/5 border border-transparent hover:border-border/20 text-muted-foreground hover:text-foreground'>
                    <X className='h-4 w-4 md:h-5 md:w-5' />
                  </Button>
                )}
              </div>
              
              {/* Content area */}
              <div className='flex-1 overflow-y-auto w-full'>
                {contactId ? (
                  <Tabs value={activeTab} className='h-full w-full flex flex-col'>
                    <TabsContent value='activities' className='m-0 h-full flex-1 data-[state=inactive]:hidden focus:outline-none p-4 md:p-6'>
                      <ContactActivities contactId={contactId} />
                    </TabsContent>
                    <TabsContent value='booking' className='m-0 h-full flex-1 data-[state=inactive]:hidden focus:outline-none p-4 md:p-6'>
                      <BookMeetingForm
                        contactId={contactId}
                        callId={callId}
                        onBooked={() => {
                          setMeetingBooked(true);
                          setActiveTab('activities');
                          setBookingPanelOpen(false);
                        }}
                        onCancel={() => {
                          setActiveTab('activities');
                          setBookingPanelOpen(false);
                        }}
                      />
                    </TabsContent>
                  </Tabs>
                ) : (
                  <div className='flex flex-col h-full items-center justify-center p-6 md:p-8 text-center bg-muted/10'>
                    <div className='bg-background p-3 md:p-4 rounded-xl shadow-sm border border-border/50 mb-3 md:mb-4'>
                      <CalendarPlus className='h-6 w-6 md:h-8 md:w-8 text-emerald-500/80' />
                    </div>
                    <h4 className='text-base md:text-lg font-bold mb-1 md:mb-2'>No contact linked</h4>
                    <p className='text-muted-foreground text-xs md:text-sm max-w-[250px]'>
                      Save the contact first to book meetings or view dial history.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
