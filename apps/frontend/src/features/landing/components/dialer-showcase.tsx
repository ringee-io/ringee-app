'use client';

/**
 * "See it dial" — an auto-playing demo of the three dialing modes (manual,
 * preview, progressive). It uses the real `DialPad` plus a pixel-faithful, fully
 * mocked clone of the in-call screen; when a call starts the dialer swaps out in
 * place for the call screen (not a modal). The pre-call stage differs per mode.
 */

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { IconDialpad } from '@tabler/icons-react';
import { Activity, Sparkles } from 'lucide-react';
import { WindowChrome, Kicker, useInViewRef } from './showcase-primitives';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { DialPad } from '@/features/calls/components/dialer.pad';
import type { MockCallContact } from './mock/mock-active-call-modal';

// A pixel-faithful, fully self-contained clone of the real in-call screen — no
// telephony, no stores, no risk to the production call stack. It swaps in place
// where the dialer was (not a modal). Loaded on demand.
const MockActiveCallScreen = dynamic(
  () =>
    import('./mock/mock-active-call-modal').then((m) => m.MockActiveCallScreen),
  { ssr: false }
);

/* ------------------------------------------------------------------ */
/* Mock data                                                           */
/* ------------------------------------------------------------------ */

type ModeKey = 'manual' | 'preview' | 'progressive';

const MODES: {
  key: ModeKey;
  icon: typeof IconDialpad;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  gradient: string;
}[] = [
  {
    key: 'manual',
    icon: IconDialpad,
    accentText: 'text-cyan-600 dark:text-cyan-400',
    accentBg: 'bg-cyan-500',
    accentBorder: 'border-cyan-500/40 bg-cyan-500/10',
    gradient: 'from-cyan-500 to-sky-500'
  }
  // {
  //   key: 'preview',
  //   icon: IconEye,
  //   accentText: 'text-violet-600 dark:text-violet-400',
  //   accentBg: 'bg-violet-500',
  //   accentBorder: 'border-violet-500/40 bg-violet-500/10',
  //   gradient: 'from-violet-500 to-fuchsia-500'
  // },
  // {
  //   key: 'progressive',
  //   icon: IconBolt,
  //   accentText: 'text-amber-600 dark:text-amber-400',
  //   accentBg: 'bg-amber-500',
  //   accentBorder: 'border-amber-500/40 bg-amber-500/10',
  //   gradient: 'from-amber-500 to-orange-500'
  // }
];

/** Opens a call to a lead in the mock ActiveCallModal clone. */
type StartCall = (contact: MockCallContact) => void;

/* ------------------------------------------------------------------ */
/* Scripted call controller — drives the mock ActiveCallModal clone    */
/* ------------------------------------------------------------------ */

function useScriptedCall() {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<MockCallContact>({
    name: '',
    number: ''
  });
  const [status, setStatus] = useState('Connecting...');
  const [muted, setMuted] = useState(false);
  const [hold, setHold] = useState(false);
  const [recording, setRecording] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const start: StartCall = (next) => {
    clearTimers();
    setMuted(false);
    setHold(false);
    setRecording(false);
    setStatus('Connecting...');
    setContact(next);
    setOpen(true);
    // Scripted lifecycle: ring → connect → auto-record → hang up, then the
    // dialer re-types and dials again, so the demo loops like a short video.
    timers.current.push(setTimeout(() => setStatus('Connected'), 1800));
    timers.current.push(setTimeout(() => setRecording(true), 3800));
    timers.current.push(setTimeout(() => setOpen(false), 9500));
  };

  const close = () => {
    clearTimers();
    setOpen(false);
  };

  useEffect(() => () => clearTimers(), []);

  return {
    open,
    contact,
    status,
    muted,
    hold,
    recording,
    setMuted,
    setHold,
    setRecording,
    start,
    close
  };
}

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

export default function DialerShowcase({
  embedded = false
}: { embedded?: boolean } = {}) {
  const t = useTranslations('marketing.liveDialer');
  const [modeIdx, setModeIdx] = useState(0);
  const [pinned, setPinned] = useState(false);
  const call = useScriptedCall();

  // Auto-rotate through the modes until the visitor takes control.
  useEffect(() => {
    if (pinned || call.open) return;
    const id = setInterval(
      () => setModeIdx((i) => (i + 1) % MODES.length),
      9000
    );
    return () => clearInterval(id);
  }, [pinned, call.open]);

  const mode = MODES[modeIdx];

  return (
    <section
      id='live-dialer'
      className={cn(
        'relative w-full overflow-hidden',
        embedded ? '' : 'border-border/40 border-t px-6 py-16 sm:py-20'
      )}
    >
      {/* <GlowBackground gradient='from-cyan-500/10 via-violet-500/5 to-transparent' /> */}

      {/* Header — hidden when embedded inside a marketing detail page that
          already provides its own section heading. */}
      {!embedded && (
        <div className='mx-auto max-w-5xl text-center'>
          <Kicker
            icon={<Activity className='h-3.5 w-3.5' strokeWidth={2} />}
            className='border-cyan-500/20 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
          >
            {t('kicker')}
          </Kicker>

          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className='xs:text-4xl mt-5 text-3xl font-bold tracking-tight sm:text-5xl'
          >
            {t('title')}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
            className='text-muted-foreground mx-auto mt-4 max-w-2xl text-base'
          >
            {t('subtitle')}
          </motion.p>
        </div>
      )}

      {/* Mode tabs */}
      <div
        className={cn(
          'mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2',
          embedded ? '' : 'mt-10'
        )}
      >
        {MODES.map((m, i) => {
          const isActive = i === modeIdx;
          return (
            <button
              key={m.key}
              onClick={() => {
                call.close();
                setModeIdx(i);
                setPinned(true);
              }}
              className={cn(
                'group relative inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all',
                isActive
                  ? `${m.accentBorder} ${m.accentText} shadow-sm`
                  : 'border-border/60 bg-background/60 text-muted-foreground hover:border-foreground/20'
              )}
            >
              <m.icon className='h-4 w-4' />
              {t(`modes.${m.key}.name`)}
              {isActive && !pinned && !call.open && (
                <motion.span
                  key={modeIdx}
                  className={`absolute right-3 -bottom-px left-3 h-0.5 rounded-full ${m.accentBg}`}
                  initial={{ scaleX: 0, originX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 9, ease: 'linear' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tagline for active mode */}
      {!call.open && (
        <AnimatePresence mode='wait'>
          <motion.p
            key={mode.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className='text-muted-foreground mx-auto mt-4 max-w-xl text-center text-sm'
          >
            {t(`modes.${mode.key}.tagline`)}
          </motion.p>
        </AnimatePresence>
      )}

      {/* Stage — the dialer swaps out for the live call screen, in place */}
      <div
        className={cn(
          'mx-auto mt-8 transition-[max-width] duration-300',
          call.open ? 'max-w-4xl' : 'max-w-screen-md'
        )}
      >
        <AnimatePresence mode='wait'>
          {call.open ? (
            <motion.div
              key='active-call'
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
            >
              <MockActiveCallScreen
                contact={call.contact}
                statusText={call.status}
                isMuted={call.muted}
                isOnHold={call.hold}
                isRecording={call.recording}
                isFreeTrialCall
                onHangup={call.close}
                onToggleMute={() => call.setMuted((v) => !v)}
                onToggleHold={() => call.setHold((v) => !v)}
                onToggleRecording={() => call.setRecording((v) => !v)}
              />
            </motion.div>
          ) : (
            <motion.div
              key={mode.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
            >
              {mode.key === 'manual' && <ManualDialer onCall={call.start} />}
              {/* {mode.key === 'preview' && <PreviewDialer onCall={call.start} />} */}
              {/* {mode.key === 'progressive' && (
                <ProgressiveDialer onCall={call.start} />
              )} */}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/** "Real Ringee UI" chip for the window title bar. */
function RealBadge() {
  const t = useTranslations('marketing.liveDialer');
  return (
    <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400'>
      <Sparkles className='h-3 w-3' />
      {t('realBadge')}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Manual dialer — real DialPad, auto-dialing into the call screen      */
/* ------------------------------------------------------------------ */

const MANUAL_CONTACT: MockCallContact = {
  name: 'Ava Chen',
  number: '+1 415 555 0192',
  company: 'Northwind Labs',
  email: 'ava@northwind.co',
  title: 'Head of Growth',
  tags: ['Webinar', 'Enterprise']
};

function ManualDialer({ onCall }: { onCall: StartCall }) {
  const t = useTranslations('marketing.liveDialer.manual');
  const [ref, inView] = useInViewRef<HTMLDivElement>(0.3);
  const [number, setNumber] = useState('');

  // Keep the latest onCall without re-running the type/auto-dial effect.
  const onCallRef = useRef(onCall);
  onCallRef.current = onCall;

  // Auto-type the number, then auto-open the call screen — like a live demo.
  useEffect(() => {
    if (!inView) return;
    const target = MANUAL_CONTACT.number.replace(/\s/g, '');
    setNumber('');
    let i = 0;
    let callTimer: ReturnType<typeof setTimeout>;
    const typeId = setInterval(() => {
      i += 1;
      setNumber(target.slice(0, i));
      if (i >= target.length) {
        clearInterval(typeId);
        callTimer = setTimeout(() => onCallRef.current(MANUAL_CONTACT), 750);
      }
    }, 110);
    return () => {
      clearInterval(typeId);
      clearTimeout(callTimer);
    };
  }, [inView]);

  return (
    <div ref={ref}>
      <WindowChrome
        icon={<IconDialpad className='h-3.5 w-3.5 text-cyan-500' />}
        title={t('window')}
        accent='from-cyan-500 to-sky-500'
        badge={<RealBadge />}
        bodyClassName='flex flex-col items-center p-5 sm:p-6'
      >
        {/* Number display */}
        <div className='flex min-h-[2.75rem] items-center justify-center'>
          {number ? (
            <span className='text-3xl font-semibold tracking-wider tabular-nums'>
              {number}
            </span>
          ) : (
            <span className='text-muted-foreground text-base'>
              {t('enterNumber')}
            </span>
          )}
        </div>

        <div className='mt-4'>
          <DialPad
            number={number}
            setNumber={setNumber}
            onDelete={() => setNumber(number.slice(0, -1))}
            onCall={async () =>
              onCall({
                ...MANUAL_CONTACT,
                number: number || MANUAL_CONTACT.number
              })
            }
            isCalling={false}
          />
        </div>

        <p className='text-muted-foreground mt-5 max-w-xs text-center text-xs'>
          {t('hint')}
        </p>
      </WindowChrome>
    </div>
  );
}
