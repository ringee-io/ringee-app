'use client';

import React from 'react';
import Link from 'next/link';
import { motion, Variants } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  ArrowUpRight,
  ShieldCheck,
  Globe2,
  CreditCard,
  Zap
} from 'lucide-react';
import {
  IconDialpad,
  IconEye,
  IconBolt,
  IconPlugConnected,
  IconPlayerRecord,
  IconDeviceMobile
} from '@tabler/icons-react';
import LogoCloud from './logo-cloud';
import { ProudlyOpenSource } from './proudly-open-source';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 28 }
  }
};

const Hero = () => {
  const t = useTranslations('marketing.hero');

  const capabilityPills = [
    { icon: IconDialpad, label: t('capabilities.manualDialer'), color: 'text-cyan-500' },
    { icon: IconEye, label: t('capabilities.previewDialer'), color: 'text-violet-500' },
    { icon: IconBolt, label: t('capabilities.progressiveDialer'), color: 'text-amber-500' },
    { icon: IconPlugConnected, label: t('capabilities.crmSync'), color: 'text-emerald-500' },
    { icon: IconPlayerRecord, label: t('capabilities.recordings'), color: 'text-rose-500' },
    { icon: IconDeviceMobile, label: t('capabilities.browserMobile'), color: 'text-sky-500' }
  ];

  const trustItems = [
    { icon: CreditCard, label: t('trust.noCard') },
    { icon: Globe2, label: t('trust.countries') },
    { icon: Zap, label: t('trust.firstCall') },
    { icon: ShieldCheck, label: t('trust.soc2') }
  ];

  return (
    <section className='relative isolate flex flex-col items-center overflow-hidden px-6 pt-16 pb-6'>
      {/* Background layers */}
      <BackgroundFx />

      <motion.div
        variants={containerVariants}
        initial='hidden'
        animate='visible'
        className='relative z-10 flex max-w-3xl flex-col items-center text-center'
      >
        {/* Open source badge */}
        <motion.div variants={itemVariants}>
          <ProudlyOpenSource
            repoUrl='https://github.com/ringee-io/ringee-app'
            className='mb-5'
          />
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={itemVariants}
          className='xs:text-5xl mt-7 max-w-[19ch] text-4xl !leading-[1.05] font-bold tracking-tight sm:text-6xl md:text-7xl'
        >
          {t('headlinePrefix')}{' '}
          <span className='relative inline-block'>
            <span className='bg-gradient-to-br from-amber-500 via-violet-500 to-cyan-500 bg-clip-text text-transparent'>
              {t('headlineHighlight')}
            </span>
            <svg
              className='absolute -bottom-1 left-0 w-full'
              viewBox='0 0 100 8'
              preserveAspectRatio='none'
              aria-hidden
            >
              <path
                d='M0 4 Q 25 0, 50 4 T 100 4'
                fill='none'
                stroke='url(#hero-underline)'
                strokeWidth='2'
                strokeLinecap='round'
              />
              <defs>
                <linearGradient
                  id='hero-underline'
                  x1='0'
                  y1='0'
                  x2='100'
                  y2='0'
                  gradientUnits='userSpaceOnUse'
                >
                  <stop offset='0%' stopColor='#f59e0b' />
                  <stop offset='50%' stopColor='#8b5cf6' />
                  <stop offset='100%' stopColor='#06b6d4' />
                </linearGradient>
              </defs>
            </svg>
          </span>
          <br className='hidden sm:block' /> {t('headlineSuffix')}
        </motion.h1>

        {/* Subcopy */}
        <motion.p
          variants={itemVariants}
          className='text-muted-foreground mt-6 max-w-[58ch] text-base sm:text-lg'
        >
          {t.rich('subcopy', {
            attio: (chunks) => (
              <span className='text-foreground font-medium'>{chunks}</span>
            ),
            odoo: (chunks) => (
              <span className='text-foreground font-medium'>{chunks}</span>
            )
          })}
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={itemVariants}
          className='mt-10 flex w-full flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4'
        >
          <Link
            href='/auth/sign-in'
            aria-label={t('tryFreeCallAria')}
            className='group focus-visible:ring-primary focus-visible:ring-offset-background relative inline-flex h-12 w-full max-w-[240px] items-center justify-center overflow-hidden rounded-xl bg-neutral-900 px-6 font-semibold text-white shadow-lg shadow-neutral-900/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-neutral-900/30 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98] sm:h-14 sm:max-w-[220px] dark:bg-white dark:text-neutral-900 dark:shadow-white/10 dark:hover:shadow-white/20'
          >
            <span className='absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent dark:via-white/40' />
            <span className='relative flex items-center gap-2 text-sm sm:text-base'>
              {t('tryFreeCall')}
              <ArrowUpRight
                className='h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5'
                aria-hidden
              />
            </span>
          </Link>

          <Link
            href='https://cal.com/ringee'
            target='_blank'
            rel='noreferrer noopener'
            className='border-border/80 hover:bg-muted/60 focus-visible:ring-primary inline-flex h-12 w-full max-w-[240px] items-center justify-center rounded-xl border bg-transparent px-6 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98] sm:h-14 sm:max-w-[220px] sm:text-base'
          >
            {t('bookDemo')}
          </Link>
        </motion.div>

        {/* Trust microbar */}
        <motion.ul
          variants={itemVariants}
          className='text-muted-foreground mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium'
        >
          {trustItems.map((item) => (
            <li key={item.label} className='inline-flex items-center gap-1.5'>
              <item.icon className='h-3.5 w-3.5' strokeWidth={2} />
              {item.label}
            </li>
          ))}
        </motion.ul>

        {/* Capability pills */}
        <motion.ul
          variants={itemVariants}
          className='mt-10 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5'
        >
          {capabilityPills.map((pill) => (
            <li key={pill.label}>
              <div className='group border-border/60 bg-background/60 hover:border-foreground/20 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur-sm transition-colors sm:text-sm'>
                <pill.icon
                  className={`h-3.5 w-3.5 ${pill.color}`}
                  strokeWidth={2}
                />
                <span>{pill.label}</span>
              </div>
            </li>
          ))}
        </motion.ul>
      </motion.div>

      {/* <LogoCloud className='relative z-10 mx-auto mt-16 max-w-3xl' /> */}
    </section>
  );
};

function BackgroundFx() {
  return (
    <>
      {/* Dotted grid */}
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]'
      >
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.12)_1px,transparent_0)] [background-size:22px_22px] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)]' />
      </div>
    </>
  );
}

export default Hero;
