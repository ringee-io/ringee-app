'use client';

/**
 * Landing-only mock twin of `features/calls/components/active.call.modal.tsx`.
 * Pixel-faithful to the real in-call screen but fully self-contained: no
 * `useCallStore`, no data-fetching child panels, no telephony. Everything runs
 * on sample data so the marketing site can show the complete experience without
 * touching (or risking) the production call stack.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Avatar,
  AvatarFallback
} from '@ringee/frontend-shared/components/ui/avatar';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@ringee/frontend-shared/components/ui/popover';
import {
  Tabs,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
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
  Clock,
  X,
  Phone,
  Mail,
  Building2,
  Tag,
  PhoneCall,
  StickyNote,
  CalendarCheck,
  CheckCircle2
} from 'lucide-react';
import { IconKeyboard } from '@tabler/icons-react';

export type MockCallContact = {
  name: string;
  number: string;
  company?: string;
  email?: string;
  title?: string;
  tags?: string[];
};

type Props = {
  contact: MockCallContact;
  statusText?: string;
  isMuted?: boolean;
  isOnHold?: boolean;
  isRecording?: boolean;
  isFreeTrialCall?: boolean;
  freeTrialRemainingSeconds?: number;
  freeTrialTotalSeconds?: number;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleHold: () => void;
  onToggleRecording: () => void;
};

const MOCK_ACTIVITIES = [
  {
    icon: PhoneCall,
    title: 'Call · Interested',
    time: '2d ago',
    tone: 'text-emerald-500'
  },
  {
    icon: StickyNote,
    title: 'Note added',
    time: '5d ago',
    tone: 'text-amber-500'
  },
  { icon: Mail, title: 'Email opened', time: '1w ago', tone: 'text-sky-500' },
  {
    icon: CalendarCheck,
    title: 'Demo booked',
    time: '2w ago',
    tone: 'text-violet-500'
  }
];

export function MockActiveCallScreen({
  contact,
  statusText = 'Connecting...',
  isMuted = false,
  isOnHold = false,
  isRecording = false,
  isFreeTrialCall = false,
  freeTrialRemainingSeconds = 60,
  freeTrialTotalSeconds = 60,
  onHangup,
  onToggleMute,
  onToggleHold,
  onToggleRecording
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [dtmfDigits, setDtmfDigits] = useState<string[]>([]);
  const [bookingPanelOpen, setBookingPanelOpen] = useState(false);
  const [meetingBooked, setMeetingBooked] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'activities' | 'contact' | 'script' | 'booking'
  >('activities');

  useEffect(() => {
    setElapsed(0);
    setMeetingBooked(false);
    setBookingPanelOpen(false);
    setActiveTab('activities');
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [contact.name]);

  useEffect(() => {
    if (bookingPanelOpen) setActiveTab('booking');
  }, [bookingPanelOpen]);

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

  const trialProgress =
    freeTrialTotalSeconds > 0
      ? ((freeTrialTotalSeconds - freeTrialRemainingSeconds) /
          freeTrialTotalSeconds) *
        100
      : 0;

  const isConnected = statusText === 'Connected' || elapsed > 0;

  return (
    <div className='border-border/60 bg-background relative flex h-[600px] flex-col overflow-hidden rounded-2xl border shadow-2xl shadow-black/5 dark:shadow-black/40'>
      {/* Free trial banner */}
      {isFreeTrialCall && (
        <div className='relative shrink-0 overflow-hidden border-b border-amber-500/20 bg-amber-500/10 px-4 py-2'>
          <div className='relative z-10 flex items-center justify-between'>
            <div className='flex items-center gap-1.5'>
              <Clock className='h-3.5 w-3.5 text-amber-600' />
              <span className='text-[10px] font-bold tracking-wider text-amber-700 uppercase sm:text-xs'>
                Free Trial · 1 min limit
              </span>
            </div>
            <span
              className={cn(
                'font-mono text-[10px] font-bold tabular-nums sm:text-xs',
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

      <div className='relative flex h-full w-full flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden'>
        {/* LEFT PANEL — the call engine */}
        <div className='bg-muted/5 border-border/20 relative flex min-h-[500px] w-full shrink-0 flex-col items-center justify-between border-b pt-6 pb-6 transition-all duration-500 md:min-h-0 md:w-[45%] md:border-r md:border-b-0 md:pt-10 md:pb-8'>
          <div
            className={cn(
              'pointer-events-none absolute top-0 right-0 left-0 -z-10 h-48 bg-gradient-to-b to-transparent opacity-20 transition-colors duration-1000 md:h-64',
              isConnected ? 'from-emerald-500/40' : 'from-primary/30'
            )}
          />

          {/* Caller ID */}
          <div className='z-10 flex w-full shrink-0 flex-col items-center px-6 md:px-8'>
            <div className='relative'>
              <Avatar
                className={cn(
                  'border-background h-20 w-20 border-4 shadow-xl transition-all duration-700 md:h-24 md:w-24',
                  isConnected
                    ? 'ring-4 shadow-emerald-500/20 ring-emerald-500/20'
                    : 'ring-border/20 ring-4'
                )}
              >
                <AvatarFallback className='from-primary/20 to-primary/5 text-primary bg-gradient-to-br text-3xl font-light md:text-4xl'>
                  {contact.name?.charAt(0) ?? 'R'}
                </AvatarFallback>
              </Avatar>
              {isRecording && (
                <div className='border-background absolute -right-1 -bottom-1 animate-pulse rounded-full border-2 bg-rose-500 px-1.5 py-0.5 text-[8px] font-black tracking-widest text-white uppercase shadow-lg md:px-2 md:text-[9px]'>
                  REC
                </div>
              )}
            </div>

            <h2 className='text-foreground mt-3 line-clamp-1 text-lg font-bold tracking-tight md:mt-4 md:text-xl'>
              {contact.name || contact.number}
            </h2>

            <div className='mt-2 flex items-center justify-center gap-1.5 md:gap-2'>
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full md:h-2 md:w-2',
                  isRecording
                    ? 'animate-pulse bg-rose-500'
                    : isConnected
                      ? 'animate-pulse bg-emerald-500'
                      : 'bg-primary/60'
                )}
              />
              <span
                className={cn(
                  'text-xs font-semibold tracking-wide uppercase md:text-sm',
                  isRecording
                    ? 'text-rose-500'
                    : isConnected
                      ? 'text-emerald-600'
                      : 'text-muted-foreground'
                )}
              >
                {meetingBooked
                  ? 'MEETING BOOKED'
                  : isRecording
                    ? 'RECORDING'
                    : statusText}
              </span>
            </div>

            <div className='mt-2 font-mono text-2xl font-light tracking-tighter tabular-nums opacity-80 md:mt-3 md:text-3xl'>
              {elapsedLabel}
            </div>
          </div>

          {/* Visualizer */}
          <div className='relative z-10 flex min-h-[80px] w-full flex-1 items-center justify-center md:min-h-[100px]'>
            {isConnected ? (
              <div className='relative flex h-12 w-24 items-center justify-center gap-1 md:h-16 md:w-32 md:gap-1.5'>
                {[0.8, 0.4, 1, 0.6, 0.9, 0.5, 0.7].map((height, i) => (
                  <div
                    key={i}
                    className='w-1 animate-pulse rounded-full bg-emerald-500/40 md:w-1.5'
                    style={{
                      height: `${height * 100}%`,
                      animationDuration: `${0.5 + i * 0.1}s`
                    }}
                  />
                ))}
              </div>
            ) : (
              <Radio className='text-primary/20 h-8 w-8 animate-pulse md:h-12 md:w-12' />
            )}
          </div>

          {/* Controls */}
          <div className='z-10 flex w-full shrink-0 flex-col items-center px-4 md:px-6'>
            <div className='border-border/50 bg-background/80 mb-4 flex items-center justify-center gap-1 rounded p-1.5 shadow-sm backdrop-blur-xl md:mb-6 md:gap-1.5 md:p-2'>
              <CtrlButton
                active={isMuted}
                onClick={onToggleMute}
                label='Mute'
                activeClass='bg-amber-500/15 text-amber-600 hover:bg-amber-500/25'
              >
                {isMuted ? (
                  <MicOff className='h-5 w-5 md:h-6 md:w-6' />
                ) : (
                  <Mic className='h-5 w-5 md:h-6 md:w-6' />
                )}
              </CtrlButton>

              <Popover>
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='hover:bg-muted/50 h-12 w-12 rounded transition-all md:h-14 md:w-14'
                        >
                          <IconKeyboard className='text-foreground/80 h-5 w-5 md:h-6 md:w-6' />
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Keypad</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <PopoverContent
                  side='top'
                  align='center'
                  className='w-64 rounded p-4 shadow-xl'
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
                        onClick={() => setDtmfDigits((p) => [...p, d])}
                        className='bg-muted/40 hover:bg-primary hover:text-primary-foreground flex h-12 items-center justify-center rounded text-xl font-medium transition-all active:scale-90 md:h-14'
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  {dtmfDigits.length > 0 && (
                    <div className='text-primary bg-primary/10 mt-3 rounded py-1.5 text-center font-mono text-sm font-semibold tracking-widest'>
                      {dtmfDigits.join(' ')}
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              <CtrlButton
                active={isOnHold}
                onClick={onToggleHold}
                label={isOnHold ? 'Resume' : 'Hold'}
                activeClass='bg-amber-500/15 text-amber-600 hover:bg-amber-500/25'
              >
                {isOnHold ? (
                  <Play className='h-5 w-5 md:h-6 md:w-6' />
                ) : (
                  <Pause className='text-foreground/80 h-5 w-5 md:h-6 md:w-6' />
                )}
              </CtrlButton>

              <CtrlButton
                active={isRecording}
                onClick={onToggleRecording}
                label={isRecording ? 'Stop Recording' : 'Record'}
                activeClass='bg-rose-500/15 text-rose-600 hover:bg-rose-500/25'
              >
                {isRecording ? (
                  <RecordingPulse className='h-5 w-5 animate-pulse md:h-6 md:w-6' />
                ) : (
                  <RecordIcon className='text-foreground/80 h-5 w-5 md:h-6 md:w-6' />
                )}
              </CtrlButton>
            </div>

            <div className='text-muted-foreground mb-3 flex items-center justify-center gap-1.5 text-[9px] font-medium tracking-widest uppercase opacity-60 md:mb-4 md:text-[10px]'>
              <Circle
                className={cn(
                  'h-1.5 w-1.5',
                  isRecording ? 'text-rose-500' : 'text-emerald-500'
                )}
              />
              Secure via <span className='text-emerald-500'>Ringee Voice</span>
            </div>

            <Button
              size='sm'
              onClick={onHangup}
              className='h-14 w-full max-w-[280px] gap-2 rounded-xl bg-rose-500 text-base font-bold text-white shadow-xl shadow-rose-500/20 transition-all hover:scale-[1.02] hover:bg-rose-600 active:scale-95 md:h-16 md:max-w-[320px] md:gap-3 md:text-lg'
            >
              <PhoneOff className='h-5 w-5 md:h-6 md:w-6' />
              END CALL
            </Button>
          </div>
        </div>

        {/* RIGHT PANEL — intelligence */}
        <div className='border-border/10 bg-background z-20 flex h-[500px] w-full shrink-0 flex-col border-l md:h-full md:w-[55%]'>
          <div className='border-border/10 flex shrink-0 items-center justify-between border-b px-4 py-3 md:px-6 md:py-4'>
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as typeof activeTab)}
              className='w-full'
            >
              <TabsList className='flex h-auto flex-wrap items-center justify-start gap-1.5 border-none bg-transparent p-0'>
                {[
                  { v: 'activities', label: 'History' },
                  { v: 'contact', label: 'Contact Info' },
                  { v: 'script', label: 'Script' },
                  { v: 'booking', label: 'Book Meeting' }
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.v}
                    value={tab.v}
                    className='data-[state=active]:border-border/30 data-[state=active]:bg-foreground/5 text-muted-foreground data-[state=active]:text-foreground rounded-xl border border-transparent bg-transparent px-3 py-1.5 text-xs font-normal shadow-none transition-all md:text-sm'
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className='w-full flex-1 overflow-y-auto'>
            {activeTab === 'activities' && <MockHistory contact={contact} />}
            {activeTab === 'contact' && <MockContactInfo contact={contact} />}
            {activeTab === 'script' && <MockScript contact={contact} />}
            {activeTab === 'booking' && (
              <MockBookingForm
                meetingBooked={meetingBooked}
                onBook={() => setMeetingBooked(true)}
                onCancel={() => setActiveTab('activities')}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CtrlButton({
  active,
  onClick,
  label,
  activeClass,
  children
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  activeClass: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            onClick={onClick}
            className={cn(
              'h-12 w-12 rounded transition-all md:h-14 md:w-14',
              active ? activeClass : 'hover:bg-muted/50'
            )}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ----------------------------- right-panel tabs ----------------------------- */

function MockHistory({ contact }: { contact: MockCallContact }) {
  return (
    <div className='space-y-4 p-4 md:p-6'>
      <div className='flex items-center gap-2'>
        <Avatar className='h-9 w-9'>
          <AvatarFallback className='bg-primary/10 text-primary text-sm font-semibold'>
            {contact.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className='text-sm font-semibold'>{contact.name}</p>
          <p className='text-muted-foreground text-xs'>
            {contact.company ?? 'Contact'} · 4 activities
          </p>
        </div>
      </div>

      <ol className='relative space-y-3 border-l pl-4'>
        {MOCK_ACTIVITIES.map((a, i) => (
          <li key={i} className='relative'>
            <span className='bg-background absolute top-1 -left-[22px] flex h-6 w-6 items-center justify-center rounded-full border'>
              <a.icon className={cn('h-3 w-3', a.tone)} />
            </span>
            <div className='bg-muted/30 rounded-lg border px-3 py-2'>
              <div className='flex items-center justify-between gap-2'>
                <span className='text-sm font-medium'>{a.title}</span>
                <span className='text-muted-foreground text-[11px]'>
                  {a.time}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MockContactInfo({ contact }: { contact: MockCallContact }) {
  const rows = [
    { icon: Phone, label: 'Phone', value: contact.number },
    { icon: Mail, label: 'Email', value: contact.email ?? 'ava@northwind.co' },
    {
      icon: Building2,
      label: 'Company',
      value: contact.company ?? 'Northwind Labs'
    }
  ];
  return (
    <div className='space-y-4 p-4 md:p-6'>
      <div>
        <p className='text-base font-semibold'>{contact.name}</p>
        <p className='text-muted-foreground text-sm'>
          {contact.title ?? 'Head of Growth'}
        </p>
      </div>
      <div className='space-y-2.5'>
        {rows.map((r) => (
          <div key={r.label} className='flex items-center gap-2.5 text-sm'>
            <r.icon className='text-muted-foreground h-4 w-4 shrink-0' />
            <span className='text-muted-foreground w-20 shrink-0'>
              {r.label}
            </span>
            <span className='min-w-0 flex-1 truncate font-medium'>
              {r.value}
            </span>
          </div>
        ))}
      </div>
      <div className='flex flex-wrap items-center gap-1.5 pt-1'>
        <Tag className='text-muted-foreground h-3.5 w-3.5' />
        {(contact.tags ?? ['Webinar', 'Enterprise']).map((t) => (
          <Badge key={t} variant='secondary' className='text-[11px]'>
            {t}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function MockScript({ contact }: { contact: MockCallContact }) {
  const sections = [
    {
      title: 'Opener',
      body: `Hi ${contact.name.split(' ')[0]}, this is Sam from Ringee — you joined our webinar yesterday. Did I catch you at an okay time?`
    },
    {
      title: 'Discovery',
      body: 'How is your team handling outbound calling today? What is the most painful part of that workflow?'
    },
    {
      title: 'Value',
      body: 'Ringee lets your reps call from the browser worldwide, with recording, analytics and an AI agent that dials and logs outcomes for you.'
    },
    {
      title: 'Close',
      body: 'Would Thursday at 2 PM work for a 20-minute demo tailored to your team?'
    }
  ];
  return (
    <div className='space-y-3 p-4 md:p-6'>
      {sections.map((s) => (
        <div key={s.title} className='bg-muted/20 rounded-lg border p-3'>
          <p className='text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase'>
            {s.title}
          </p>
          <p className='text-sm leading-relaxed'>{s.body}</p>
        </div>
      ))}
    </div>
  );
}

function MockBookingForm({
  meetingBooked,
  onBook,
  onCancel
}: {
  meetingBooked: boolean;
  onBook: () => void;
  onCancel: () => void;
}) {
  if (meetingBooked) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 p-8 text-center'>
        <div className='flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15'>
          <CheckCircle2 className='h-7 w-7 text-emerald-500' />
        </div>
        <h4 className='text-lg font-bold'>Meeting booked</h4>
        <p className='text-muted-foreground max-w-[260px] text-sm'>
          Thursday at 2:00 PM · 30 min. A calendar invite is on its way.
        </p>
      </div>
    );
  }
  return (
    <div className='space-y-4 p-4 md:p-6'>
      <div className='flex items-center gap-2 text-sm font-semibold'>
        <CalendarPlus className='h-4 w-4 text-emerald-500' />
        Book a meeting
      </div>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <div className='space-y-1'>
          <Label className='text-xs'>Date &amp; time</Label>
          <Input type='text' defaultValue='Thu, Jun 12 · 2:00 PM' readOnly />
        </div>
        <div className='space-y-1'>
          <Label className='text-xs'>Duration (min)</Label>
          <Input type='text' defaultValue='30' readOnly />
        </div>
        <div className='space-y-1 sm:col-span-2'>
          <Label className='text-xs'>Title</Label>
          <Input
            type='text'
            defaultValue='Ringee demo · Northwind Labs'
            readOnly
          />
        </div>
        <div className='space-y-1 sm:col-span-2'>
          <Label className='text-xs'>Attendee email</Label>
          <Input type='text' defaultValue='ava@northwind.co' readOnly />
        </div>
      </div>
      <div className='flex gap-2 pt-1'>
        <Button onClick={onBook} className='flex-1'>
          <CalendarCheck className='h-4 w-4' /> Book meeting
        </Button>
        <Button variant='outline' onClick={onCancel}>
          <X className='h-4 w-4' /> Cancel
        </Button>
      </div>
    </div>
  );
}
