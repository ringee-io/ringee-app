'use client';

/**
 * "Ringee in your pocket" — the iOS app showcase. It presents the real App
 * Store preview slides (the same artwork shipped to the store) in an
 * auto-scrolling gallery, alongside an App Store download badge and the native
 * feature highlights. Available for iPhone and iPad.
 */

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import {
  IconBrandApple,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDialpad,
  IconHandFinger,
  IconCalendarClock
} from '@tabler/icons-react';
import { Star } from 'lucide-react';
import Marquee from './ui/marquee';
import { Kicker, GlowBackground } from './showcase-primitives';

const APP_STORE_URL = 'https://apps.apple.com/app/ringee-app/id6773448247';

/** The five App Store preview slides, in order. */
const SCREENSHOTS = [
  '/assets/app-screenshots/ios_1_1.png',
  '/assets/app-screenshots/ios_1_2.png',
  '/assets/app-screenshots/ios_1_3.png',
  '/assets/app-screenshots/ios_1_4.png',
  '/assets/app-screenshots/ios_1_5.png'
];

const FEATURES = [
  { key: 'nativeDialer', icon: IconDialpad },
  { key: 'swipeToCall', icon: IconHandFinger },
  { key: 'callbacks', icon: IconCalendarClock }
] as const;

export default function MobileApp() {
  const t = useTranslations('marketing.mobileApp');

  return (
    <section
      id='mobile-app'
      className='border-border/40 relative w-full overflow-hidden border-t px-6 py-16 sm:py-20'
    >
      <GlowBackground gradient='from-blue-500/10 via-violet-500/5 to-transparent' />

      {/* Header */}
      <div className='mx-auto max-w-5xl text-center'>
        <Kicker
          icon={<IconBrandApple className='h-3.5 w-3.5' />}
          className='border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400'
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

        {/* Download badge + availability + rating */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className='mt-8 flex flex-col items-center gap-5'
        >
          <a
            href={APP_STORE_URL}
            target='_blank'
            rel='noopener noreferrer'
            className='group inline-flex items-center gap-3 rounded-2xl bg-black px-6 py-3 text-white shadow-lg ring-1 ring-white/10 transition-all hover:-translate-y-0.5 hover:bg-neutral-900 dark:bg-white dark:text-black dark:ring-black/10 dark:hover:bg-neutral-100'
          >
            <IconBrandApple className='h-8 w-8' />
            <span className='flex flex-col text-left leading-none'>
              <span className='text-[11px] font-medium opacity-80'>
                {t('badge.downloadOn')}
              </span>
              <span className='text-xl font-semibold tracking-tight'>
                {t('badge.appStore')}
              </span>
            </span>
          </a>

          <div className='flex flex-wrap items-center justify-center gap-x-5 gap-y-3'>
            {/* Device chips */}
            <div className='flex items-center gap-2'>
              <span className='border-border/60 bg-background/60 text-foreground/80 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium'>
                <IconDeviceMobile className='h-3.5 w-3.5' />
                {t('devices.iphone')}
              </span>
              <span className='border-border/60 bg-background/60 text-foreground/80 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium'>
                <IconDeviceTablet className='h-3.5 w-3.5' />
                {t('devices.ipad')}
              </span>
            </div>

            {/* Rating */}
            <div className='flex items-center gap-2'>
              <div className='flex'>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className='h-4 w-4 fill-amber-400 text-amber-400'
                  />
                ))}
              </div>
              <span className='text-muted-foreground text-sm'>
                {t('rating')}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* App Store preview gallery */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className='relative mt-14'
      >
        <Marquee
          pauseOnHover
          repeat={2}
          className='[--duration:55s] [--gap:1.5rem]'
        >
          {SCREENSHOTS.map((src, i) => (
            <a
              key={src}
              href={APP_STORE_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='relative shrink-0 transition-transform duration-300 hover:-translate-y-1'
            >
              <Image
                src={src}
                alt={t(`screens.${i}`)}
                width={1242}
                height={2688}
                className='border-border/60 h-[440px] w-auto rounded-[2rem] border object-cover shadow-2xl ring-1 shadow-black/10 ring-black/5 sm:h-[540px] dark:ring-white/10'
              />
            </a>
          ))}
        </Marquee>

        {/* Edge fades so the gallery dissolves into the section */}
        <div className='from-background pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r to-transparent sm:w-32' />
        <div className='from-background pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l to-transparent sm:w-32' />
      </motion.div>

      {/* Native feature highlights */}
      <div className='mx-auto mt-14 grid max-w-screen-lg grid-cols-1 gap-4 sm:grid-cols-3'>
        {FEATURES.map((feat) => (
          <motion.div
            key={feat.key}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            className='group bg-background/60 hover:border-foreground/20 rounded-2xl border p-5 text-center transition-colors sm:text-left'
          >
            <div className='bg-muted mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg transition-colors group-hover:bg-blue-500/10 sm:mx-0'>
              <feat.icon className='h-5 w-5 transition-colors group-hover:text-blue-500' />
            </div>
            <h4 className='text-sm font-semibold'>
              {t(`features.${feat.key}.title`)}
            </h4>
            <p className='text-muted-foreground mt-1 text-[13px] leading-relaxed'>
              {t(`features.${feat.key}.description`)}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
