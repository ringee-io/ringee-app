'use client';

import { motion, Variants } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import {
  IconRefresh,
  IconUsers,
  IconPhoneCheck,
  IconNote,
  IconPlugConnected,
  IconArrowsLeftRight
} from '@tabler/icons-react';
import { Plug, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';

type Provider = {
  key: string;
  name: string;
  subtitle?: string;
  logo: string;
  logoDarkInvert?: boolean;
  accent: string;
  available: boolean;
};

const providers: Provider[] = [
  {
    key: 'attio',
    name: 'Attio',
    logo: '/companies/attio.svg',
    logoDarkInvert: true,
    accent: 'from-violet-500/15 to-transparent ring-violet-500/20',
    available: true
  },
  {
    key: 'odoo19',
    name: 'Odoo 19+',
    subtitle: 'JSON-2 API',
    logo: '/companies/odoo.svg',
    accent: 'from-emerald-500/15 to-transparent ring-emerald-500/20',
    available: true
  },
  {
    key: 'odoo14',
    name: 'Odoo 14–18',
    subtitle: 'Legacy RPC',
    logo: '/companies/odoo.svg',
    accent: 'from-fuchsia-500/15 to-transparent ring-fuchsia-500/20',
    available: true
  },
  {
    key: 'hubspot',
    name: 'HubSpot',
    logo: '/companies/hubspot.svg',
    accent: 'from-orange-500/15 to-transparent ring-orange-500/20',
    available: false
  },
  {
    key: 'salesforce',
    name: 'Salesforce',
    logo: '/companies/salesforce.svg',
    accent: 'from-sky-500/15 to-transparent ring-sky-500/20',
    available: false
  }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 26 }
  }
};

export default function CrmIntegrations() {
  const tCRM = useTranslations('marketing.crmIntegrations');

  const syncFeatures = [
    {
      icon: IconUsers,
      title: tCRM('syncFeatures.contactSync.title'),
      description: tCRM('syncFeatures.contactSync.description')
    },
    {
      icon: IconPhoneCheck,
      title: tCRM('syncFeatures.callLogs.title'),
      description: tCRM('syncFeatures.callLogs.description')
    },
    {
      icon: IconNote,
      title: tCRM('syncFeatures.notesTranscripts.title'),
      description: tCRM('syncFeatures.notesTranscripts.description')
    },
    {
      icon: IconArrowsLeftRight,
      title: tCRM('syncFeatures.fieldMappings.title'),
      description: tCRM('syncFeatures.fieldMappings.description')
    },
    {
      icon: IconRefresh,
      title: tCRM('syncFeatures.retryOutbox.title'),
      description: tCRM('syncFeatures.retryOutbox.description')
    },
    {
      icon: IconPlugConnected,
      title: tCRM('syncFeatures.orgScope.title'),
      description: tCRM('syncFeatures.orgScope.description')
    }
  ];

  return (
    <section
      id='integrations'
      className='border-border/40 relative w-full overflow-hidden border-t px-6 py-16 sm:py-20'
    >
      {/* Header */}
      <div className='mx-auto max-w-5xl text-center'>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className='mx-auto inline-flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-600 dark:text-violet-400'
        >
          <Plug className='h-3.5 w-3.5' strokeWidth={2} />
          <span>{tCRM('kicker')}</span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className='xs:text-4xl mt-5 text-3xl font-bold tracking-tight sm:text-5xl'
        >
          {tCRM('title')}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
          className='text-muted-foreground mx-auto mt-4 max-w-2xl text-base'
        >
          {tCRM('subtitle')}
        </motion.p>
      </div>

      {/* Provider cards */}
      <motion.div
        variants={containerVariants}
        initial='hidden'
        whileInView='visible'
        viewport={{ once: true, margin: '-80px' }}
        className='mx-auto mt-14 grid max-w-screen-lg grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
      >
        {providers.map((p) => (
          <motion.div
            key={p.key}
            variants={itemVariants}
            className={`group bg-background/60 relative overflow-hidden rounded-lg border p-5 ring-1 ${p.accent.split(' ').slice(-1)[0]} transition-all hover:-translate-y-0.5 hover:shadow-lg ${
              !p.available ? 'opacity-90' : ''
            }`}
          >
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${p.accent} opacity-70`}
              aria-hidden
            />

            <div className='relative z-10 flex h-full flex-col'>
              <div className='flex items-start gap-3'>
                <div className='bg-background/90 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border p-2 shadow-sm'>
                  <Image
                    src={p.logo}
                    alt={`${p.name} logo`}
                    width={28}
                    height={28}
                    className={`h-6 w-6 object-contain ${p.logoDarkInvert ? 'dark:invert' : ''}`}
                  />
                </div>
                <div className='min-w-0 flex-1'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <h3 className='text-base font-semibold'>{p.name}</h3>
                    {p.subtitle && (
                      <span className='border-border/60 bg-background/80 text-muted-foreground rounded-lg border px-2 py-0.5 text-[10px] font-medium'>
                        {p.subtitle}
                      </span>
                    )}
                  </div>
                  <div className='mt-1 flex items-center gap-1.5'>
                    {p.available ? (
                      <>
                        <span className='h-1.5 w-1.5 animate-pulse rounded-lg bg-green-500' />
                        <span className='text-[11px] font-medium text-green-600 dark:text-green-500'>
                          {tCRM('availableNow')}
                        </span>
                      </>
                    ) : (
                      <span className='inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-500'>
                        <Sparkles className='h-3 w-3' /> {tCRM('comingSoon')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <p className='text-muted-foreground mt-4 text-sm leading-relaxed'>
                {tCRM(`providers.${p.key}.description`)}
              </p>
            </div>
          </motion.div>
        ))}

        {/* "More coming" card */}
        <motion.div
          variants={itemVariants}
          className='group bg-background/40 hover:border-foreground/30 relative flex flex-col items-start justify-between overflow-hidden rounded-lg border border-dashed p-5 transition-colors'
        >
          <div>
            <div className='bg-muted flex h-11 w-11 items-center justify-center rounded-lg'>
              <Sparkles
                className='text-foreground/70 h-5 w-5'
                strokeWidth={1.7}
              />
            </div>
            <h3 className='mt-3 text-base font-semibold'>
              {tCRM('moreOnTheWay.title')}
            </h3>
            <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
              {tCRM('moreOnTheWay.description')}
            </p>
          </div>
          <a
            href='https://github.com/ringee-io/ringee-app/issues'
            target='_blank'
            rel='noreferrer noopener'
            className='text-foreground/80 hover:text-foreground mt-4 inline-flex items-center gap-1 text-sm font-medium'
          >
            {tCRM('moreOnTheWay.cta')}
            <ArrowRight className='h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5' />
          </a>
        </motion.div>
      </motion.div>

      {/* Capabilities */}
      <div className='mx-auto mt-16 max-w-screen-lg'>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className='text-center'
        >
          <h3 className='text-xl font-semibold tracking-tight sm:text-2xl'>
            {tCRM('capabilities.title')}
          </h3>
          <p className='text-muted-foreground mx-auto mt-2 max-w-xl text-sm'>
            {tCRM('capabilities.subtitle')}
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial='hidden'
          whileInView='visible'
          viewport={{ once: true, margin: '-80px' }}
          className='mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
        >
          {syncFeatures.map((feat) => (
            <motion.div
              key={feat.title}
              variants={itemVariants}
              className='group bg-background/60 hover:border-foreground/20 rounded-lg border p-5 transition-colors'
            >
              <div className='bg-muted mb-3 flex h-9 w-9 items-center justify-center rounded-lg transition-colors group-hover:bg-violet-500/10'>
                <feat.icon className='h-5 w-5 transition-colors group-hover:text-violet-500' />
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
            {tCRM('badges.oauthAuth')}
          </span>
          <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
            <CheckCircle2 className='h-3.5 w-3.5 text-green-600' />
            {tCRM('badges.encryptedCreds')}
          </span>
          <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
            <CheckCircle2 className='h-3.5 w-3.5 text-green-600' />
            {tCRM('badges.idempotentWrites')}
          </span>
        </motion.div>
      </div>
    </section>
  );
}
