import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AudioLines, Check, History, ListChecks, Phone } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { Container, CtaButtons, Section } from './primitives';
import { RenderingSwitch } from './rendering-switch';
import { RunsFrom } from './agent-marks';
import { OperatorPortrait } from './operator-portrait';
import { TeamPlanNote } from './team-plan-note';
import styles from './calling-hero.module.css';

const PROOF_POINTS = ['pricing', 'openSource', 'unlimitedUsers'] as const;
const SHARED_CAPABILITIES = [
  { key: 'phoneNumbers', icon: Phone },
  { key: 'callHistory', icon: History },
  { key: 'recordings', icon: AudioLines },
  { key: 'outcomes', icon: ListChecks }
] as const;

export async function CallingHero() {
  const t = await getTranslations('marketing.callingHero');

  return (
    <Section className={cn(styles.hero, 'pt-10 pb-14 sm:pt-12 sm:pb-20')}>
      <Container className='relative max-w-[1440px]'>
        <div className='relative z-10 flex flex-col items-center text-center'>
          <RenderingSwitch active='human' className='mb-10' />

          <Link
            href='/open-source'
            className='text-muted-foreground hover:text-foreground mb-5 inline-flex items-center gap-2.5 rounded-full text-[11px] font-medium tracking-[0.14em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500'
          >
            <span
              aria-hidden
              className='h-1.5 w-1.5 rounded-full bg-emerald-500'
            />
            {t('eyebrow')}
          </Link>

          <h1 className={styles.headline}>
            {t('headline')}{' '}
            <span className='block text-emerald-700 dark:text-emerald-400'>
              {t('headlineHighlight')}
            </span>
          </h1>
        </div>

        <div className={styles.stage}>
          <div className={styles.copy}>
            <p className='text-muted-foreground max-w-xl text-base leading-relaxed text-pretty sm:text-lg'>
              {t('description')}
            </p>

            <RunsFrom className='mt-6 justify-center gap-x-3' />

            <CtaButtons className='mt-7 w-full justify-center sm:w-auto' />

            <TeamPlanNote className='mt-4' />

            <ul className='text-muted-foreground mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs leading-relaxed'>
              {PROOF_POINTS.map((point) => (
                <li key={point} className='inline-flex items-center gap-1.5'>
                  <Check
                    aria-hidden
                    className='h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400'
                  />
                  {t(`proof.${point}`)}
                </li>
              ))}
            </ul>
          </div>

          <OperatorPortrait operator='human' label={t('humanLabel')} />
          <OperatorPortrait operator='robot' label={t('aiLabel')} />
        </div>

        <div aria-hidden className={styles.connections}>
          <span className={styles.leftBeam} />
          <span className={styles.rightBeam} />
          <span className={styles.junction} />
        </div>

        <div className={styles.sharedStack}>
          <div className='px-5 py-5 text-center sm:px-8 sm:py-6'>
            <div className='flex items-center justify-center gap-2.5'>
              <AudioLines
                aria-hidden
                className='h-5 w-5 text-emerald-700 dark:text-emerald-400'
              />
              <h2 className='text-xl font-semibold tracking-tight sm:text-2xl'>
                {t('stackTitle')}
              </h2>
            </div>
            <p className='text-muted-foreground mt-2 text-xs leading-relaxed text-balance sm:text-sm'>
              {t('stackModules')}
            </p>
          </div>

          <div className='border-border/70 border-t px-4 pt-4 pb-5 sm:px-7'>
            <p className='text-muted-foreground text-center text-[10px] font-medium tracking-[0.16em] uppercase'>
              {t('recordTitle')}
            </p>
            <ul className='mt-4 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4'>
              {SHARED_CAPABILITIES.map(({ key, icon: Icon }) => (
                <li
                  key={key}
                  className='flex items-center justify-center gap-2 text-xs font-medium sm:text-[13px]'
                >
                  <Icon
                    aria-hidden
                    className='text-muted-foreground h-4 w-4 shrink-0'
                  />
                  {t(`records.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </Section>
  );
}
