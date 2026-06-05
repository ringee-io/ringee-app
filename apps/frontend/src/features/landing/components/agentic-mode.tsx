'use client';

/**
 * "Agentic mode" section — the flagship story for the MCP / CLI / ChatGPT App /
 * webhooks surface. Centerpiece is an auto-playing chat that shows an AI agent
 * driving Ringee through real MCP tool calls (search_contacts → start_call →
 * log_call_outcome), with a synced "under the hood" pipeline so visitors
 * understand exactly what is happening.
 */

import React from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  Sparkles,
  MessageSquare,
  Code2,
  MousePointer2,
  Feather,
  Bot,
  Plug,
  Terminal,
  Webhook,
  ShieldCheck,
  Wand2,
  CheckCircle2,
  PiggyBank,
  Boxes,
  PhoneCall,
  Brain,
  ArrowRight,
  ArrowUp,
  Search,
  UserPlus,
  Link2,
  ClipboardCheck,
  CalendarPlus
} from 'lucide-react';
import {
  WindowChrome,
  TypingDots,
  ToolCallChip,
  useStepLoop,
  useInViewRef,
  BRAND_GRADIENT
} from './showcase-primitives';
import {
  MockContactCard,
  MockCallSessionCard,
  MockCallOutcomeCard
} from './agentic-chat-cards';

/* ------------------------------------------------------------------ */
/* Chat demo timing                                                    */
/* ------------------------------------------------------------------ */

/** Per-step durations (ms). Length defines the loop. Stable module ref. */
const CHAT_STEPS = [1700, 1600, 2200, 1600, 2200, 2000, 3200];
/** Which pipeline node lights up at each step. */
const ACTIVE_BY_STEP = [0, 1, 1, 2, 2, 3, 4];

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 26 }
  }
};

export default function AgenticMode() {
  const t = useTranslations('marketing.agentic');

  const clients = [
    {
      name: 'Claude',
      icon: Sparkles,
      color: 'text-orange-500',
      bg: 'from-orange-500/15'
    },
    {
      name: 'ChatGPT',
      icon: MessageSquare,
      color: 'text-emerald-500',
      bg: 'from-emerald-500/15'
    },
    {
      name: 'Codex',
      icon: Code2,
      color: 'text-zinc-500',
      bg: 'from-zinc-500/15'
    },
    {
      name: 'Cursor',
      icon: MousePointer2,
      color: 'text-sky-500',
      bg: 'from-sky-500/15'
    },
    {
      name: 'Hermes',
      icon: Feather,
      color: 'text-violet-500',
      bg: 'from-violet-500/15'
    },
    {
      name: 'OpenClaw',
      icon: Bot,
      color: 'text-cyan-500',
      bg: 'from-cyan-500/15'
    }
  ];

  const channels = [
    {
      key: 'mcp',
      icon: Plug,
      accent: 'text-violet-500',
      tint: 'group-hover:bg-violet-500/10',
      ring: 'ring-violet-500/20',
      preview: (
        <div className='flex flex-wrap gap-1.5'>
          {[
            'search_contacts',
            'start_call',
            'create_call_session',
            'log_call_outcome'
          ].map((n) => (
            <span
              key={n}
              className='border-border/60 bg-background/80 rounded-md border px-1.5 py-0.5 font-mono text-[10px]'
            >
              {n}
            </span>
          ))}
        </div>
      )
    },
    {
      key: 'cli',
      icon: Terminal,
      accent: 'text-emerald-500',
      tint: 'group-hover:bg-emerald-500/10',
      ring: 'ring-emerald-500/20',
      preview: (
        <div className='bg-background/80 border-border/60 rounded-md border px-2.5 py-1.5 font-mono text-[11px]'>
          <span className='text-emerald-500'>$</span> ringee call{' '}
          <span className='text-foreground/90'>&quot;Ava Chen&quot;</span>{' '}
          <span className='text-muted-foreground'>--log</span>
        </div>
      )
    },
    {
      key: 'chatgpt',
      icon: MessageSquare,
      accent: 'text-sky-500',
      tint: 'group-hover:bg-sky-500/10',
      ring: 'ring-sky-500/20',
      preview: (
        <div className='border-border/60 bg-background/80 flex items-center gap-2 rounded-md border px-2 py-1.5'>
          <span className='flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[9px] font-bold text-white'>
            AC
          </span>
          <div className='min-w-0'>
            <p className='truncate text-[11px] font-semibold'>Ava Chen</p>
            <p className='text-muted-foreground truncate text-[9px]'>
              Northwind Labs · Hot lead
            </p>
          </div>
          <PhoneCall className='ml-auto h-3.5 w-3.5 text-sky-500' />
        </div>
      )
    },
    {
      key: 'webhooks',
      icon: Webhook,
      accent: 'text-amber-500',
      tint: 'group-hover:bg-amber-500/10',
      ring: 'ring-amber-500/20',
      preview: (
        <div className='space-y-1'>
          {[
            { ev: 'call.completed', code: '200' },
            { ev: 'contact.synced', code: '200' }
          ].map((r) => (
            <div
              key={r.ev}
              className='border-border/60 bg-background/80 flex items-center justify-between rounded-md border px-2 py-1 font-mono text-[10px]'
            >
              <span className='text-foreground/90'>POST {r.ev}</span>
              <span className='rounded bg-emerald-500/15 px-1 text-emerald-600 dark:text-emerald-400'>
                {r.code}
              </span>
            </div>
          ))}
        </div>
      )
    }
  ];

  const benefits = [
    {
      key: 'lowCost',
      icon: PiggyBank,
      color: 'text-emerald-500',
      tint: 'group-hover:bg-emerald-500/10'
    },
    {
      key: 'ownData',
      icon: ShieldCheck,
      color: 'text-violet-500',
      tint: 'group-hover:bg-violet-500/10'
    },
    {
      key: 'plainLanguage',
      icon: Wand2,
      color: 'text-amber-500',
      tint: 'group-hover:bg-amber-500/10'
    },
    {
      key: 'headless',
      icon: Boxes,
      color: 'text-sky-500',
      tint: 'group-hover:bg-sky-500/10'
    }
  ];

  return (
    <section id='agentic' className='relative w-full overflow-hidden px-6'>
      <div className='mx-auto max-w-5xl text-center'>
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className='xs:text-4xl mt-5 text-3xl font-bold tracking-tight sm:text-5xl'
        >
          {t.rich('title', {
            grad: (c) => (
              <span
                className={`bg-gradient-to-br ${BRAND_GRADIENT} bg-clip-text text-transparent`}
              >
                {c}
              </span>
            )
          })}
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

      {/* The ChatGPT App outbound flow */}
      <AgenticFlowStrip />

      {/* Live agent demo */}
      <LiveAgentDemo />

      {/* Compatible clients */}
      <div className='mx-auto mt-20 max-w-screen-lg text-center'>
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className='text-xl font-semibold tracking-tight sm:text-2xl'
        >
          {t('clients.title')}
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className='text-muted-foreground mx-auto mt-2 max-w-xl text-sm'
        >
          {t('clients.subtitle')}
        </motion.p>

        <motion.ul
          variants={containerVariants}
          initial='hidden'
          whileInView='visible'
          viewport={{ once: true, margin: '-60px' }}
          className='mt-8 flex flex-wrap items-center justify-center gap-2.5'
        >
          {clients.map((c) => (
            <motion.li key={c.name} variants={itemVariants}>
              <div className='group border-border/60 bg-background/70 hover:border-foreground/20 inline-flex items-center gap-2 rounded-xl border py-2 pr-3.5 pl-2 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md'>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${c.bg} to-transparent`}
                >
                  <c.icon className={`h-4 w-4 ${c.color}`} strokeWidth={2} />
                </span>
                <span className='text-sm font-semibold'>{c.name}</span>
              </div>
            </motion.li>
          ))}
          <motion.li variants={itemVariants}>
            <div className='inline-flex items-center gap-2 rounded-xl border border-dashed border-violet-500/40 bg-violet-500/5 py-2 pr-3.5 pl-3 text-violet-600 dark:text-violet-400'>
              <Boxes className='h-4 w-4' strokeWidth={2} />
              <span className='text-sm font-semibold'>
                {t('clients.anyMcp')}
              </span>
            </div>
          </motion.li>
        </motion.ul>
        <p className='text-muted-foreground/80 mx-auto mt-4 max-w-md text-xs'>
          {t('clients.footnote')}
        </p>
      </div>

      {/* Channels */}
      <div className='mx-auto mt-20 max-w-screen-lg'>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className='text-center'
        >
          <h3 className='text-xl font-semibold tracking-tight sm:text-2xl'>
            {t('channels.title')}
          </h3>
          <p className='text-muted-foreground mx-auto mt-2 max-w-xl text-sm'>
            {t('channels.subtitle')}
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial='hidden'
          whileInView='visible'
          viewport={{ once: true, margin: '-80px' }}
          className='mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'
        >
          {channels.map((ch) => (
            <motion.div
              key={ch.key}
              variants={itemVariants}
              className={`group bg-background/60 relative flex flex-col overflow-hidden rounded-xl border p-5 ring-1 ${ch.ring} transition-all hover:-translate-y-0.5 hover:shadow-lg`}
            >
              <div className='flex items-center justify-between'>
                <div
                  className={`bg-muted flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${ch.tint}`}
                >
                  <ch.icon className={`h-5 w-5 ${ch.accent}`} />
                </div>
                <span className='border-border/60 bg-background/70 text-muted-foreground rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase'>
                  {t(`channels.${ch.key}.tag`)}
                </span>
              </div>
              <h4 className='mt-4 text-sm font-semibold'>
                {t(`channels.${ch.key}.title`)}
              </h4>
              <p className='text-muted-foreground mt-1 text-[13px] leading-relaxed'>
                {t(`channels.${ch.key}.description`)}
              </p>
              <div className='mt-4'>{ch.preview}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Benefits */}
      <div className='mx-auto mt-16 max-w-screen-lg'>
        <div className='border-border/60 from-muted/40 relative overflow-hidden rounded-2xl border bg-gradient-to-br to-transparent p-6 sm:p-8'>
          <div className='grid items-center gap-6 lg:grid-cols-[1.1fr_1.4fr]'>
            <div>
              <h3 className='text-xl font-semibold tracking-tight sm:text-2xl'>
                {t('benefits.title')}
              </h3>
              <p className='text-muted-foreground mt-2 max-w-md text-sm'>
                {t('benefits.subtitle')}
              </p>
              <div className='mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400'>
                <PiggyBank className='h-3.5 w-3.5' />
                {t('benefits.pill')}
              </div>
            </div>

            <motion.div
              variants={containerVariants}
              initial='hidden'
              whileInView='visible'
              viewport={{ once: true, margin: '-60px' }}
              className='grid grid-cols-1 gap-3 sm:grid-cols-2'
            >
              {benefits.map((b) => (
                <motion.div
                  key={b.key}
                  variants={itemVariants}
                  className='group bg-background/70 hover:border-foreground/20 rounded-xl border p-4 transition-colors'
                >
                  <div
                    className={`bg-muted mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${b.tint}`}
                  >
                    <b.icon className={`h-4 w-4 ${b.color}`} />
                  </div>
                  <h4 className='text-sm font-semibold'>
                    {t(`benefits.items.${b.key}.title`)}
                  </h4>
                  <p className='text-muted-foreground mt-1 text-[12.5px] leading-relaxed'>
                    {t(`benefits.items.${b.key}.description`)}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Reassurance footer */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className='mt-8 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-center sm:gap-6'
        >
          {['scoped', 'guarded', 'openSource'].map((k) => (
            <span
              key={k}
              className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'
            >
              <CheckCircle2 className='h-3.5 w-3.5 text-green-600' />
              {t(`badges.${k}`)}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* ChatGPT App flow strip — mirrors @ringee-io/agent PRIMARY_FLOW       */
/* ------------------------------------------------------------------ */

const FLOW_STEPS = [
  { key: 'prospect', icon: Search },
  { key: 'contact', icon: UserPlus },
  { key: 'session', icon: Link2 },
  { key: 'call', icon: PhoneCall },
  { key: 'outcome', icon: ClipboardCheck },
  { key: 'followup', icon: CalendarPlus }
] as const;

function AgenticFlowStrip() {
  const t = useTranslations('marketing.agentic.flow');
  return (
    <div className='mx-auto mt-12 max-w-screen-lg'>
      <p className='text-muted-foreground text-center text-xs font-medium tracking-wide uppercase'>
        {t('title')}
      </p>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className='mt-4 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2'
      >
        {FLOW_STEPS.map((s, i) => (
          <div key={s.key} className='flex items-center gap-1.5'>
            <span className='border-border/60 bg-background/70 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm'>
              <s.icon className='h-3.5 w-3.5 text-violet-500' strokeWidth={2} />
              {t(`steps.${s.key}`)}
            </span>
            {i < FLOW_STEPS.length - 1 && (
              <ArrowRight className='text-muted-foreground/60 h-3.5 w-3.5' />
            )}
          </div>
        ))}
      </motion.div>
      <p className='text-muted-foreground/80 mx-auto mt-3 max-w-xl text-center text-xs'>
        {t('note')}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live agent demo — the auto-playing "video"                          */
/* ------------------------------------------------------------------ */

/** ChatGPT-style avatar mark (emerald/teal), used in the chat window. */
function ChatGptMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`flex items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-white ${className}`}
    >
      <Sparkles className='h-2.5 w-2.5' strokeWidth={2.6} />
    </span>
  );
}

export function LiveAgentDemo({
  embedded = false
}: { embedded?: boolean } = {}) {
  const t = useTranslations('marketing.agentic.demo');
  const [ref, inView] = useInViewRef<HTMLDivElement>(0.25);
  const step = useStepLoop(CHAT_STEPS.length, CHAT_STEPS, inView);
  const active = ACTIVE_BY_STEP[step] ?? 0;

  const pipeline = [
    { icon: Brain, label: t('pipeline.intent') },
    { icon: Plug, label: 'search_contacts', mono: true },
    { icon: Link2, label: 'create_call_session', mono: true },
    { icon: CheckCircle2, label: 'log_call_outcome', mono: true },
    { icon: Sparkles, label: t('pipeline.summarize') }
  ];

  return (
    <div
      ref={ref}
      className={`mx-auto grid max-w-screen-lg items-stretch gap-5 lg:grid-cols-[1.55fr_1fr] ${embedded ? '' : 'mt-14'}`}
    >
      {/* Chat window */}
      <WindowChrome
        icon={<ChatGptMark className='h-4 w-4' />}
        title={t('windowTitle')}
        badge={
          <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400'>
            <span className='relative flex h-1.5 w-1.5'>
              <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
              <span className='relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500' />
            </span>
            {t('live')}
          </span>
        }
        bodyClassName='flex min-h-[420px] flex-col gap-3 p-4 sm:p-5'
      >
        <AnimatePresence mode='popLayout' initial={false}>
          {/* User prompt */}
          {step >= 0 && (
            <motion.div
              key='user'
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className='flex justify-end'
            >
              <div className='max-w-[85%] rounded-2xl rounded-tr-sm bg-neutral-900 px-3.5 py-2.5 text-sm text-white dark:bg-white dark:text-neutral-900'>
                {t('userPrompt')}
              </div>
            </motion.div>
          )}

          {/* search_contacts */}
          {step >= 1 && (
            <motion.div
              key='search'
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className='flex flex-col gap-2'
            >
              <div className='flex items-center gap-2'>
                <ToolCallChip
                  name='search_contacts'
                  state={step < 2 ? 'running' : 'done'}
                />
                <span className='text-muted-foreground text-xs'>
                  {step < 2 ? t('searching') : t('foundLeads')}
                </span>
              </div>
            </motion.div>
          )}

          {/* search_contacts → ContactCard */}
          {step >= 2 && (
            <motion.div
              key='contact'
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <MockContactCard t={(k) => t(k)} />
            </motion.div>
          )}

          {/* create_call_session → CallSessionCard */}
          {step >= 3 && (
            <motion.div
              key='session'
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className='flex flex-col gap-2'
            >
              <div className='flex items-center gap-2'>
                <ToolCallChip
                  name='create_call_session'
                  state={step < 4 ? 'running' : 'done'}
                />
                <span className='text-muted-foreground text-xs'>
                  {step < 4 ? t('sessionCreating') : t('sessionReady')}
                </span>
              </div>
              {step >= 4 && <MockCallSessionCard t={(k) => t(k)} />}
            </motion.div>
          )}

          {/* log_call_outcome → CallOutcomeCard */}
          {step >= 5 && (
            <motion.div
              key='outcome'
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className='flex flex-col gap-2'
            >
              <div className='flex items-center gap-2'>
                <ToolCallChip name='log_call_outcome' state='done' />
              </div>
              <MockCallOutcomeCard t={(k) => t(k)} />
            </motion.div>
          )}

          {/* Final assistant summary */}
          {step >= 6 && (
            <motion.div
              key='final'
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className='flex items-start gap-2'
            >
              <ChatGptMark className='mt-0.5 h-6 w-6 shrink-0' />
              <div className='bg-muted/50 max-w-[88%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm'>
                {t('summary')}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom: thinking indicator + a ChatGPT-style composer */}
        <div className='mt-auto space-y-2 pt-1'>
          {step >= 1 && step < 6 && (
            <div className='text-muted-foreground flex items-center gap-2 text-xs'>
              <TypingDots /> {t('working')}
            </div>
          )}
          <div className='border-border/60 bg-muted/40 flex items-center gap-2 rounded-2xl border px-3 py-2'>
            <span className='text-muted-foreground flex-1 truncate text-sm'>
              {t('composer')}
            </span>
            <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white'>
              <ArrowUp className='h-4 w-4' strokeWidth={2.5} />
            </span>
          </div>
        </div>
      </WindowChrome>

      {/* Under the hood pipeline */}
      <div className='border-border/60 bg-background/40 flex flex-col rounded-2xl border p-5'>
        <p className='text-muted-foreground text-xs font-semibold tracking-wider uppercase'>
          {t('pipeline.title')}
        </p>
        <ol className='mt-4 flex-1 space-y-1'>
          {pipeline.map((node, i) => {
            const isActive = i === active;
            const isDone = i < active;
            return (
              <li
                key={node.label}
                className='relative flex items-start gap-3 pb-3'
              >
                {i < pipeline.length - 1 && (
                  <span
                    className={`absolute top-7 left-[13px] h-full w-px ${
                      isDone ? 'bg-emerald-500/40' : 'bg-border'
                    }`}
                  />
                )}
                <span
                  className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    isActive
                      ? 'border-violet-500/40 bg-violet-500/15 text-violet-600 dark:text-violet-400'
                      : isDone
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-border bg-muted text-muted-foreground'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className='h-4 w-4' />
                  ) : (
                    <node.icon className='h-4 w-4' />
                  )}
                  {isActive && (
                    <motion.span
                      layoutId='pipeline-glow'
                      className='absolute inset-0 rounded-lg ring-2 ring-violet-500/40'
                    />
                  )}
                </span>
                <div className='pt-1'>
                  <p
                    className={`text-[13px] transition-colors ${
                      node.mono ? 'font-mono' : 'font-medium'
                    } ${isActive ? 'text-foreground' : isDone ? 'text-foreground/70' : 'text-muted-foreground'}`}
                  >
                    {node.label}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        <div className='border-border/60 text-muted-foreground mt-2 flex items-center gap-2 border-t pt-4 text-[11px]'>
          <ShieldCheck className='h-3.5 w-3.5 text-emerald-500' />
          {t('pipeline.note')}
        </div>
      </div>
    </div>
  );
}
