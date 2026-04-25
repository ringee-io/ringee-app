'use client';

import { motion, Variants } from 'framer-motion';
import Image from 'next/image';
import {
  IconSearch,
  IconMail,
  IconPhone,
  IconBuilding,
  IconFilter,
  IconDatabase,
  IconCoin,
  IconBolt
} from '@tabler/icons-react';
import { ArrowRight, CheckCircle2, Sparkles, Wand2 } from 'lucide-react';

type Provider = {
  key: 'apollo' | 'prospeo';
  name: string;
  tagline: string;
  description: string;
  logo: string;
  logoDarkInvert?: boolean;
  badge: string;
  badgeClass: string;
  accent: string;
  ring: string;
  iconColor: string;
  capabilities: { icon: typeof IconMail; label: string }[];
};

const providers: Provider[] = [
  {
    key: 'apollo',
    name: 'Apollo.io',
    tagline: 'Prospect, enrich and call — all in one flow.',
    description:
      'Search across 275M+ contacts and 70M+ companies. Filter by title, industry, geography, headcount and tech stack, then reveal verified emails and mobile numbers on demand.',
    logo: '/companies/apollo.png',
    badge: 'Lead search + enrichment',
    badgeClass:
      'border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400',
    accent: 'from-sky-500/15 to-transparent',
    ring: 'ring-sky-500/20',
    iconColor: 'text-sky-500',
    capabilities: [
      { icon: IconSearch, label: 'People & company search' },
      { icon: IconMail, label: 'Verified email reveal' },
      { icon: IconPhone, label: 'Mobile number reveal' },
      { icon: IconBuilding, label: 'Firmographics & tech stack' }
    ]
  },
  {
    key: 'prospeo',
    name: 'Prospeo.io',
    tagline: 'High-accuracy email finder, on tap.',
    description:
      'Resolve emails from LinkedIn URLs or name + company pairs with industry-leading validity rates. Perfect for enriching existing contacts before you dial.',
    logo: '/companies/prospeo.svg',
    logoDarkInvert: true,
    badge: 'Contact enrichment',
    badgeClass:
      'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    accent: 'from-emerald-500/15 to-transparent',
    ring: 'ring-emerald-500/20',
    iconColor: 'text-emerald-500',
    capabilities: [
      { icon: IconMail, label: 'Email finder from LinkedIn' },
      { icon: IconSearch, label: 'Domain & name lookup' },
      { icon: IconBolt, label: 'Bulk enrichment' },
      { icon: IconDatabase, label: 'Validated deliverability' }
    ]
  }
];

const workflowFeatures = [
  {
    icon: IconFilter,
    title: 'Granular search filters',
    description:
      'Title seniority, industry, headcount, location, technologies — compose the exact ICP query your GTM motion needs.'
  },
  {
    icon: IconMail,
    title: 'On-demand email & phone reveal',
    description:
      'Pay only for the contacts you actually want to reach. Reveals are cached and attached to the lead permanently.'
  },
  {
    icon: IconCoin,
    title: 'Unified credits',
    description:
      'One credit ledger covers search, reveals and enrichment. Transparent per-action pricing, no surprise add-ons.'
  },
  {
    icon: IconDatabase,
    title: 'Auto-dedup on import',
    description:
      'Imported leads are deduped against your existing contacts by phone and email before they hit your pipeline.'
  },
  {
    icon: IconBolt,
    title: 'One-click to campaign',
    description:
      'Push a search result straight into a Progressive or Preview dialer campaign — ready to call in seconds.'
  },
  {
    icon: Wand2,
    title: 'Enrich existing contacts',
    description:
      'Backfill missing emails, phones, titles and company data on the contacts already in Ringee — no CSV shuffling.'
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

export default function FindLeadsEnrichment() {
  return (
    <section
      id='find-leads'
      className='border-border/40 relative w-full overflow-hidden border-t px-6 py-16 sm:py-20'
    >
      {/* subtle background glow */}
      <div className='pointer-events-none absolute inset-0 -z-10'>
        <div className='absolute top-0 left-1/2 h-[320px] w-[720px] -translate-x-1/2 rounded-lg bg-gradient-to-b from-sky-500/10 via-emerald-500/5 to-transparent blur-3xl' />
      </div>

      {/* Header */}
      <div className='mx-auto max-w-5xl text-center'>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className='mx-auto inline-flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-600 dark:text-sky-400'
        >
          <Wand2 className='h-3.5 w-3.5' strokeWidth={2} />
          <span>Find leads &amp; enrich data</span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className='xs:text-4xl mt-5 text-3xl font-bold tracking-tight sm:text-5xl'
        >
          Source your next conversation, without leaving Ringee
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
          className='text-muted-foreground mx-auto mt-4 max-w-2xl text-base'
        >
          Connect Apollo.io or Prospeo.io and go from empty pipeline to
          ready-to-dial list in minutes. Search, reveal and enrich — all metered
          against a single Ringee credit balance.
        </motion.p>
      </div>

      {/* Provider cards */}
      <motion.div
        variants={containerVariants}
        initial='hidden'
        whileInView='visible'
        viewport={{ once: true, margin: '-80px' }}
        className='mx-auto mt-14 grid max-w-screen-lg grid-cols-1 gap-6 lg:grid-cols-2'
      >
        {providers.map((p) => (
          <motion.div
            key={p.key}
            variants={itemVariants}
            className={`group bg-background/60 relative overflow-hidden rounded-lg border p-7 ring-1 ${p.ring} backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-xl`}
          >
            {/* Color wash */}
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${p.accent} opacity-70`}
              aria-hidden
            />

            <div className='relative z-10 flex flex-col gap-5'>
              <div className='flex items-start justify-between gap-3'>
                <div className='flex items-center gap-3'>
                  <div className='bg-background/90 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border p-2 shadow-sm ring-1 ring-black/5 dark:ring-white/10'>
                    <Image
                      src={p.logo}
                      alt={`${p.name} logo`}
                      width={32}
                      height={32}
                      className={`h-7 w-7 object-contain ${p.logoDarkInvert ? 'dark:invert' : ''}`}
                    />
                  </div>
                  <div>
                    <h3 className='text-xl font-semibold'>{p.name}</h3>
                    <p className='text-foreground/70 text-sm font-medium'>
                      {p.tagline}
                    </p>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-lg border px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${p.badgeClass}`}
                >
                  {p.badge}
                </span>
              </div>

              <p className='text-muted-foreground text-sm leading-relaxed'>
                {p.description}
              </p>

              <ul className='mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2'>
                {p.capabilities.map((c) => (
                  <li
                    key={c.label}
                    className='text-foreground/85 flex items-start gap-2 text-sm'
                  >
                    <c.icon
                      className={`mt-0.5 h-4 w-4 shrink-0 ${p.iconColor}`}
                      strokeWidth={2.2}
                    />
                    <span>{c.label}</span>
                  </li>
                ))}
              </ul>

              <div className='border-border/50 mt-2 flex items-center justify-between gap-2 border-t pt-4'>
                <span className='inline-flex items-center gap-1.5 text-[11px] font-medium text-green-600 dark:text-green-500'>
                  <span className='h-1.5 w-1.5 animate-pulse rounded-lg bg-green-500' />
                  Available now
                </span>
                <span className='text-muted-foreground inline-flex items-center gap-1 text-xs'>
                  Bring your own API key
                  <ArrowRight className='h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5' />
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Workflow features */}
      <div className='mx-auto mt-16 max-w-screen-lg'>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className='text-center'
        >
          <h3 className='text-xl font-semibold tracking-tight sm:text-2xl'>
            Built for a tight prospect-to-call loop
          </h3>
          <p className='text-muted-foreground mx-auto mt-2 max-w-xl text-sm'>
            Every search, reveal and enrichment lands in your Ringee workspace —
            ready for a dialer, a CRM sync or a workflow.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial='hidden'
          whileInView='visible'
          viewport={{ once: true, margin: '-80px' }}
          className='mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
        >
          {workflowFeatures.map((feat) => (
            <motion.div
              key={feat.title}
              variants={itemVariants}
              className='group bg-background/60 hover:border-foreground/20 rounded-lg border p-5 transition-colors'
            >
              <div className='bg-muted mb-3 flex h-9 w-9 items-center justify-center rounded-lg transition-colors group-hover:bg-sky-500/10'>
                <feat.icon className='h-5 w-5 transition-colors group-hover:text-sky-500' />
              </div>
              <h4 className='text-sm font-semibold'>{feat.title}</h4>
              <p className='text-muted-foreground mt-1 text-[13px] leading-relaxed'>
                {feat.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Reassurance footer */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className='mt-10 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-center sm:gap-6'
        >
          <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
            <CheckCircle2 className='h-3.5 w-3.5 text-green-600' />
            Pay-per-action credits
          </span>
          <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
            <CheckCircle2 className='h-3.5 w-3.5 text-green-600' />
            Encrypted credentials at rest
          </span>
          <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
            <CheckCircle2 className='h-3.5 w-3.5 text-green-600' />
            Dedupe against existing contacts
          </span>
          <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
            <Sparkles className='h-3.5 w-3.5 text-sky-500' />
            More providers coming
          </span>
        </motion.div>
      </div>
    </section>
  );
}
