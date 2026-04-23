'use client';

import { motion, Variants } from 'framer-motion';
import {
  IconEye,
  IconBolt,
  IconList,
  IconClockHour4,
  IconRepeat,
  IconTargetArrow,
  IconHeartRateMonitor,
  IconPhoneCall
} from '@tabler/icons-react';
import { ArrowRight, Sparkles } from 'lucide-react';

const modes = [
  {
    id: 'preview',
    tag: 'Automatic Preview Dialer',
    tagline: 'Agent decides. Ringee dials.',
    description:
      'Pull the next qualified lead from the queue, review the contact, notes and last disposition, then launch the call with one click. Perfect for high-value outreach where context matters.',
    color: 'from-violet-500/20 via-violet-500/5 to-transparent',
    ring: 'ring-violet-500/20',
    icon: IconEye,
    iconColor: 'text-violet-500',
    bullets: [
      'Lead preview card with contact, last attempt & disposition',
      'One-click dial with your verified caller ID',
      'Agent-paced — great for quality-over-quantity outreach'
    ]
  },
  {
    id: 'progressive',
    tag: 'Progressive Dialer',
    tagline: 'Ready? Ringee pulls the next one.',
    description:
      'The dialer orchestrator auto-assigns the next lead the moment an agent is ready. Minimal idle time, consistent throughput — without the noise of predictive over-dialing.',
    color: 'from-amber-500/20 via-amber-500/5 to-transparent',
    ring: 'ring-amber-500/20',
    icon: IconBolt,
    iconColor: 'text-amber-500',
    bullets: [
      'Live orchestrator pairs ready agents with eligible leads',
      'Compliance-aware: respects timezone & work windows',
      'No dropped calls — 1:1 agent-to-call ratio'
    ]
  }
];

const supportFeatures = [
  {
    icon: IconList,
    title: 'CSV & manual lead import',
    description:
      'Drop in thousands of leads at once. Built-in dedupe against existing contacts and leads.'
  },
  {
    icon: IconTargetArrow,
    title: 'Dispositions & outcomes',
    description:
      'Categorize every call — positive, neutral, negative, no-contact — with custom per-campaign dispositions.'
  },
  {
    icon: IconClockHour4,
    title: 'Calling window compliance',
    description:
      'Timezone-aware schedules with working hours and working days. Leads only get called when it is legal and polite.'
  },
  {
    icon: IconRepeat,
    title: 'Retries & max attempts',
    description:
      'Configurable max attempts per lead and retry delays — the retry engine handles the rest.'
  },
  {
    icon: IconPhoneCall,
    title: 'Callbacks & wrap-up',
    description:
      'Schedule callbacks, set per-campaign wrap-up time, and drop voicemails on no-answer.'
  },
  {
    icon: IconHeartRateMonitor,
    title: 'Live outbound analytics',
    description:
      'Agent sessions, call attempts, connect rate and dispositions — streamed live to your dashboard.'
  }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 26 }
  }
};

export default function Campaigns() {
  return (
    <section
      id='campaigns'
      className='border-border/40 relative w-full overflow-hidden border-t px-6 py-16 sm:py-20'
    >
      {/* subtle background glow */}
      <div className='pointer-events-none absolute inset-0 -z-10'>
        <div className='absolute top-0 left-1/2 h-[320px] w-[720px] -translate-x-1/2 rounded-lg bg-gradient-to-b from-amber-500/10 via-violet-500/5 to-transparent blur-3xl' />
      </div>

      {/* Header */}
      <div className='mx-auto max-w-5xl text-center'>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className='mx-auto inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-500'
        >
          <Sparkles className='h-3.5 w-3.5' strokeWidth={2} />
          <span>Outbound campaigns</span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className='xs:text-4xl mt-5 text-3xl font-bold tracking-tight sm:text-5xl'
        >
          Purpose-built dialers for every playbook
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
          className='text-muted-foreground mx-auto mt-4 max-w-2xl text-base'
        >
          Run cold outreach, follow-ups, and re-engagement with the dialer mode
          that matches your team&apos;s flow — from agent-reviewed calls to
          hands-off auto-dialing.
        </motion.p>
      </div>

      {/* Dialer modes */}
      <motion.div
        variants={containerVariants}
        initial='hidden'
        whileInView='visible'
        viewport={{ once: true, margin: '-80px' }}
        className='mx-auto mt-14 grid max-w-screen-lg grid-cols-1 gap-6 lg:grid-cols-2'
      >
        {modes.map((mode) => (
          <motion.div
            key={mode.id}
            variants={itemVariants}
            className={`group bg-background/60 relative overflow-hidden rounded-lg border p-7 ring-1 ${mode.ring} backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-xl`}
          >
            {/* Color wash */}
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${mode.color} opacity-60`}
              aria-hidden
            />

            <div className='relative z-10 flex flex-col gap-5'>
              <div className='flex items-start justify-between'>
                <div
                  className={`bg-background/80 flex h-11 w-11 items-center justify-center rounded-lg shadow-sm ring-1 ring-black/5 dark:ring-white/10`}
                >
                  <mode.icon className={`h-6 w-6 ${mode.iconColor}`} />
                </div>
                <span className='border-border/60 bg-background/70 text-muted-foreground rounded-lg border px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase'>
                  {mode.id === 'preview'
                    ? 'Human-in-the-loop'
                    : 'Auto-assigned'}
                </span>
              </div>

              <div>
                <h3 className='text-xl font-semibold'>{mode.tag}</h3>
                <p className='text-foreground/70 text-sm font-medium'>
                  {mode.tagline}
                </p>
              </div>

              <p className='text-muted-foreground text-sm leading-relaxed'>
                {mode.description}
              </p>

              <ul className='mt-1 space-y-2'>
                {mode.bullets.map((b) => (
                  <li
                    key={b}
                    className='text-foreground/85 flex items-start gap-2 text-sm'
                  >
                    <ArrowRight
                      className={`mt-0.5 h-4 w-4 shrink-0 ${mode.iconColor}`}
                      strokeWidth={2.5}
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Supporting features */}
      <div className='mx-auto mt-14 max-w-screen-lg'>
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className='text-center text-xl font-semibold tracking-tight sm:text-2xl'
        >
          Everything you need to run a campaign
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className='text-muted-foreground mx-auto mt-2 max-w-xl text-center text-sm'
        >
          From lead import to live analytics — batteries included.
        </motion.p>

        <motion.div
          variants={containerVariants}
          initial='hidden'
          whileInView='visible'
          viewport={{ once: true, margin: '-80px' }}
          className='mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
        >
          {supportFeatures.map((feat) => (
            <motion.div
              key={feat.title}
              variants={itemVariants}
              className='group bg-background/60 hover:border-foreground/20 rounded-lg border p-5 transition-colors'
            >
              <div className='bg-muted mb-3 flex h-9 w-9 items-center justify-center rounded-lg transition-colors group-hover:bg-amber-500/10'>
                <feat.icon className='h-5 w-5 transition-colors group-hover:text-amber-500' />
              </div>
              <h4 className='text-sm font-semibold'>{feat.title}</h4>
              <p className='text-muted-foreground mt-1 text-[13px] leading-relaxed'>
                {feat.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
