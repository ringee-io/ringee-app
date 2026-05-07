'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { CircleCheck, CircleHelp, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function Pricing() {
  const t = useTranslations('marketing.pricing');

  const individualFeatures: { key: string; tooltipKey?: string }[] = [
    { key: 'outbound', tooltipKey: 'coverage' },
    { key: 'billingPerSecond' },
    { key: 'recording', tooltipKey: 'recording' },
    { key: 'rentNumbers', tooltipKey: 'numbers' },
    { key: 'instantActivation' },
    { key: 'manageNumbers' }
  ];

  const businessFeatures: { key: string; tooltipKey?: string }[] = [
    { key: 'everythingIndividual' },
    { key: 'teamCollab' },
    { key: 'unlimitedMembers' },
    { key: 'volumeRates', tooltipKey: 'business' },
    { key: 'prioritySupport' }
  ];

  return (
    <div
      id='pricing'
      className='xs:py-20 flex flex-col items-center justify-center px-6 py-12'
    >
      <h1 className='xs:text-4xl text-center text-3xl font-bold tracking-tight md:text-5xl'>
        {t('title')}
      </h1>
      <p className='text-muted-foreground mt-3 max-w-2xl text-center text-base'>
        {t.rich('subtitle', {
          strong: (chunks) => <strong>{chunks}</strong>
        })}
      </p>

      <div className='mx-auto mt-12 grid max-w-screen-lg grid-cols-1 gap-8 md:grid-cols-2'>
        {/* Individuals / B2C */}
        <div className='bg-background/50 relative flex flex-col rounded-xl border p-6'>
          <div className='flex flex-1 flex-col'>
            <h3 className='text-lg font-medium'>{t('individual.title')}</h3>
            <p className='mt-2 text-4xl font-bold'>{t('individual.price')}</p>
            <p className='text-muted-foreground text-sm font-medium'>
              {t('individual.priceCaption')}
            </p>
            <Separator className='my-6' />
            <ul className='flex-1 space-y-2'>
              {individualFeatures.map((f) => (
                <li key={f.key} className='flex items-start gap-1.5'>
                  <CircleCheck className='mt-1 h-4 w-4 text-green-600' />
                  {t(`individual.features.${f.key}` as never)}
                  {f.tooltipKey && (
                    <Tooltip>
                      <TooltipTrigger className='cursor-help'>
                        <CircleHelp className='mt-1 h-4 w-4 text-gray-500' />
                      </TooltipTrigger>
                      <TooltipContent>
                        {t(`tooltips.${f.tooltipKey}` as never)}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <Link href='/auth/sign-up'>
            <Button size='lg' className='mt-4 w-full cursor-pointer'>
              {t('individual.cta')}
            </Button>
          </Link>
        </div>

        {/* Business / B2B */}
        <div className='bg-background/50 relative flex flex-col rounded-xl border p-6'>
          <div className='flex flex-1 flex-col'>
            <div className='flex items-center justify-between'>
              <h3 className='text-lg font-medium'>{t('business.title')}</h3>
              <Building2 className='text-primary h-5 w-5' />
            </div>
            <p className='mt-2 text-4xl font-bold'>{t('business.price')}</p>
            <p className='text-muted-foreground text-sm font-medium'>
              {t('business.priceCaption')}
            </p>
            <Separator className='my-6' />
            <ul className='flex-1 space-y-2'>
              {businessFeatures.map((f) => (
                <li key={f.key} className='flex items-start gap-1.5'>
                  <CircleCheck className='mt-1 h-4 w-4 text-green-600' />
                  {t(`business.features.${f.key}` as never)}
                  {f.tooltipKey && (
                    <Tooltip>
                      <TooltipTrigger className='cursor-help'>
                        <CircleHelp className='mt-1 h-4 w-4 text-gray-500' />
                      </TooltipTrigger>
                      <TooltipContent>
                        {t(`tooltips.${f.tooltipKey}` as never)}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <Link href='/auth/sign-up'>
            <Button className='mt-4 w-full cursor-pointer' size='lg'>
              {t('business.cta')}
            </Button>
          </Link>
        </div>
      </div>

      <div className='text-muted-foreground mt-10 text-center text-sm'>
        {t('footnote')}
      </div>
    </div>
  );
}
