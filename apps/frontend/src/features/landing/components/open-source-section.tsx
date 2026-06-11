'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Github,
  Star,
  Users,
  ShieldCheck,
  Code,
  TestTube,
  Cloud,
  ChevronRight,
  Fingerprint
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { useTranslations } from 'next-intl';

export default function OpenSourceSection() {
  const t = useTranslations('marketing.openSource');
  const [stars, setStars] = useState<number | null>(null);
  const [contributors, setContributors] = useState<number | null>(null);

  useEffect(() => {
    // Fetch stars
    fetch('https://api.github.com/repos/ringee-io/ringee-app')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.stargazers_count === 'number') {
          setStars(data.stargazers_count);
        }
      })
      .catch(console.error);

    // Fetch contributors count
    fetch(
      'https://api.github.com/repos/ringee-io/ringee-app/contributors?per_page=1'
    )
      .then((res) => {
        const linkHeader = res.headers.get('link');
        if (linkHeader) {
          const match = linkHeader.match(/page=(\d+)>; rel="last"/);
          if (match) {
            setContributors(parseInt(match[1], 10));
            return;
          }
        }
        return res.json().then((data) => {
          if (Array.isArray(data)) {
            setContributors(data.length);
          }
        });
      })
      .catch(console.error);
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 300, damping: 24 }
    }
  };

  return (
    <section
      id='open-source'
      className='border-border/40 relative overflow-hidden border-t py-16 sm:py-16'
    >
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-16'>
        {/* Header Section */}
        <div className='mb-12 max-w-4xl'>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className='mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-500'
          >
            <ShieldCheck className='h-4 w-4' strokeWidth={1.5} />
            <span>{t('badge')}</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className='text-foreground max-w-3xl text-3xl leading-tight font-bold tracking-tight sm:text-4xl lg:text-5xl'
          >
            {t('sectionTitle')}
          </motion.h2>
        </div>

        {/* Content Section */}
        <div className='mt-8 grid items-stretch gap-x-12 gap-y-12 sm:mt-12 lg:grid-cols-2'>
          {/* Left Column */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className='relative z-10 flex flex-col'
          >
            <h3 className='text-foreground mb-3 text-2xl font-bold'>
              {t('subheadline')}
            </h3>
            <p className='text-muted-foreground mb-8 max-w-md text-base leading-relaxed'>
              {t('description')}
            </p>

            <div className='mb-12'>
              <div className='group relative inline-block'>
                <div className='absolute -inset-0.5 rounded-lg bg-gradient-to-r from-amber-500 to-indigo-500 opacity-20 blur transition duration-500 group-hover:opacity-40'></div>
                <Link
                  href='https://github.com/ringee-io/ringee-app'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <Button
                    variant='outline'
                    className='relative h-10 gap-2 rounded-lg pr-4 pl-3 text-sm font-medium shadow-sm transition-transform group-hover:scale-[1.02]'
                  >
                    <Github className='h-4 w-4' />
                    {t('githubCta')}
                  </Button>
                </Link>
              </div>
            </div>

            <div className='border-border/40 mt-auto flex items-start gap-10 border-t pt-8 sm:gap-14'>
              <div className='group cursor-default space-y-2'>
                <div className='text-muted-foreground flex items-center gap-2 transition-colors group-hover:text-amber-500'>
                  <Star className='h-5 w-5' strokeWidth={2} />
                  <span className='text-xs font-medium tracking-wider uppercase'>
                    {t('starsLabel')}
                  </span>
                </div>
                <div className='origin-left text-3xl font-bold tracking-tight transition-transform group-hover:scale-105'>
                  {stars !== null
                    ? Intl.NumberFormat('en-US', {
                        notation: 'compact',
                        maximumFractionDigits: 1
                      }).format(stars)
                    : '...'}
                </div>
              </div>

              <div className='group cursor-default space-y-2'>
                <div className='text-muted-foreground flex items-center gap-2 transition-colors group-hover:text-blue-500'>
                  <Users className='h-5 w-5' strokeWidth={2} />
                  <span className='text-xs font-medium tracking-wider uppercase'>
                    {t('contributorsLabel')}
                  </span>
                </div>
                <div className='origin-left text-3xl font-bold tracking-tight transition-transform group-hover:scale-105'>
                  {contributors !== null
                    ? Intl.NumberFormat('en-US', {
                        notation: 'compact',
                        maximumFractionDigits: 1
                      }).format(contributors)
                    : '...'}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column */}
          <div className='border-border/40 relative flex flex-col border-t pt-8 lg:border-t-0 lg:pt-0'>
            {/* The Blue Curved Line (Desktop Only) */}
            <div className='pointer-events-none absolute top-6 bottom-0 left-[-60px] z-0 hidden w-[60px] lg:block'>
              <svg
                className='absolute inset-0 h-full w-full text-blue-400/50 dark:text-blue-500/40'
                preserveAspectRatio='none'
                viewBox='0 0 100 400'
                fill='none'
              >
                <path
                  d='M 0 400 C 60 380, 70 150, 100 0'
                  stroke='currentColor'
                  strokeWidth='1.5'
                  strokeDasharray='4 4'
                  className='animate-[dash_20s_linear_infinite]'
                  vectorEffect='non-scaling-stroke'
                />
                <motion.circle
                  cx='100'
                  cy='0'
                  r='4'
                  fill='currentColor'
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
              </svg>
            </div>

            <div className='border-border/40 relative z-10 flex h-full flex-col lg:border-l lg:pl-10'>
              {/* Features Grid */}
              <motion.div
                variants={containerVariants}
                initial='hidden'
                whileInView='visible'
                viewport={{ once: true }}
                className='border-border/40 grid grid-cols-2 border-b'
              >
                <motion.div
                  variants={itemVariants}
                  className='group border-border/40 border-border/40 relative flex cursor-default flex-col items-center justify-center overflow-hidden border-r border-b p-6 text-center sm:p-8'
                >
                  <div className='absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100' />
                  <Fingerprint
                    className='text-muted-foreground mb-3 h-6 w-6 transition-all duration-300 group-hover:-translate-y-1 group-hover:text-indigo-500'
                    strokeWidth={1.5}
                  />
                  <span className='text-foreground/80 group-hover:text-foreground text-sm font-medium transition-colors'>
                    {t('features.securePersonnel')}
                  </span>
                </motion.div>

                <motion.div
                  variants={itemVariants}
                  className='group border-border/40 relative flex cursor-default flex-col items-center justify-center overflow-hidden border-b p-6 text-center sm:p-8'
                >
                  <div className='bg-gradient-to-sw absolute inset-0 from-blue-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100' />
                  <Code
                    className='text-muted-foreground mb-3 h-6 w-6 transition-all duration-300 group-hover:-translate-y-1 group-hover:text-blue-500'
                    strokeWidth={1.5}
                  />
                  <span className='text-foreground/80 group-hover:text-foreground text-sm font-medium transition-colors'>
                    {t('features.secureDevelopment')}
                  </span>
                </motion.div>

                <motion.div
                  variants={itemVariants}
                  className='group border-border/40 relative flex cursor-default flex-col items-center justify-center overflow-hidden border-r p-6 text-center sm:p-8'
                >
                  <div className='absolute inset-0 bg-gradient-to-tr from-amber-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100' />
                  <TestTube
                    className='text-muted-foreground mb-3 h-6 w-6 transition-all duration-300 group-hover:-translate-y-1 group-hover:text-amber-500'
                    strokeWidth={1.5}
                  />
                  <span className='text-foreground/80 group-hover:text-foreground text-sm font-medium transition-colors'>
                    {t('features.secureTesting')}
                  </span>
                </motion.div>

                <motion.div
                  variants={itemVariants}
                  className='group relative flex cursor-default flex-col items-center justify-center overflow-hidden p-6 text-center sm:p-8'
                >
                  <div className='absolute inset-0 bg-gradient-to-tl from-emerald-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100' />
                  <Cloud
                    className='text-muted-foreground mb-3 h-6 w-6 transition-all duration-300 group-hover:-translate-y-1 group-hover:text-emerald-500'
                    strokeWidth={1.5}
                  />
                  <span className='text-foreground/80 group-hover:text-foreground text-sm font-medium transition-colors'>
                    {t('features.cloudSecurity')}
                  </span>
                </motion.div>
              </motion.div>

              {/* Compliance Text */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className='w-full pt-8 pb-4'
              >
                <h4 className='text-foreground mb-3 flex items-center gap-2 text-2xl font-bold tracking-tight'>
                  <ShieldCheck className='h-6 w-6 text-amber-500' />
                  {t('soc2Title')}
                </h4>
                <p className='text-muted-foreground mb-6 max-w-sm text-sm leading-relaxed'>
                  {t('soc2Description')}
                </p>
                <Button
                  asChild
                  variant='ghost'
                  className='group hover:bg-muted/50 -ml-3 h-9 rounded-lg px-3 text-sm font-medium'
                >
                  <Link href='/blog/ringee-open-source-self-hosted-security'>
                    {t('readMore')}
                    <ChevronRight className='ml-1 h-4 w-4 transition-transform group-hover:translate-x-1' />
                  </Link>
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
