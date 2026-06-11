'use client';

import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useTranslations } from 'next-intl';

type RowConfig = {
  id: string;
  adversusBoolean?: boolean;
  genesysBoolean?: boolean;
};

const rowConfigs: RowConfig[] = [
  { id: 'browserBased' },
  { id: 'singleUser', adversusBoolean: false, genesysBoolean: false },
  { id: 'pricingModel' },
  { id: 'perSeat', adversusBoolean: true, genesysBoolean: true },
  { id: 'monthlyMin' },
  { id: 'globalCoverage', genesysBoolean: true },
  { id: 'outboundDialer', adversusBoolean: true, genesysBoolean: true },
  { id: 'smallTeams', genesysBoolean: false },
  { id: 'setupTime' }
];

export default function Comparison() {
  const t = useTranslations('marketing.comparison');

  const comparisonData = rowConfigs.map((config) => ({
    feature: t(`rows.${config.id}.feature`),
    ringee: t(`rows.${config.id}.ringee`),
    adversus:
      config.adversusBoolean !== undefined
        ? config.adversusBoolean
        : t(`rows.${config.id}.adversus`),
    genesys:
      config.genesysBoolean !== undefined
        ? config.genesysBoolean
        : t(`rows.${config.id}.genesys`)
  }));

  return (
    <div id='comparison' className='xs:py-20 w-full px-6 py-12'>
      <h2 className='xs:text-4xl text-center text-3xl font-bold tracking-tight sm:text-5xl'>
        {t('title')}
      </h2>
      <p className='text-muted-foreground mt-3 text-center text-sm md:text-base'>
        {t('subtitle')}
      </p>

      {/* Scrollable wrapper */}
      <div className='bg-background/50 mx-auto mt-12 w-full max-w-screen-lg overflow-x-auto rounded-xl border'>
        <div className='min-w-[700px]'>
          <table className='w-full text-sm md:text-base'>
            <thead>
              <tr className='bg-muted/40 text-muted-foreground'>
                <th className='text-foreground/90 px-4 py-4 text-left font-semibold'>
                  {t('table.featuresHeader')}
                </th>
                <th className='text-primary px-4 py-4 text-left font-semibold'>
                  Ringee.io
                </th>
                <th className='px-4 py-4 text-left font-semibold'>Adversus</th>
                <th className='px-4 py-4 text-left font-semibold'>Genesys</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((item, i) => (
                <tr
                  key={i}
                  className={cn(
                    'border-border/40 border-t transition-colors',
                    i % 2 === 0 ? 'bg-muted/20' : 'bg-background/30'
                  )}
                >
                  {/* Feature */}
                  <td className='text-muted-foreground px-4 py-4 font-medium'>
                    {item.feature}
                  </td>

                  {/* Ringee (always check + text) */}
                  <td className='text-foreground px-4 py-4'>
                    <div className='flex items-start gap-2'>
                      <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-green-600' />
                      <span>{item.ringee}</span>
                    </div>
                  </td>

                  {/* Adversus */}
                  <td className='text-foreground px-4 py-4'>
                    {item.adversus === true ? (
                      <CheckCircle2 className='h-4 w-4 text-green-600' />
                    ) : item.adversus === false ? (
                      <XCircle className='h-4 w-4 text-red-500' />
                    ) : (
                      <div className='flex items-center gap-2 text-yellow-500'>
                        <AlertTriangle className='h-8 w-8' />
                        <span className='text-foreground/80 text-[13px]'>
                          {item.adversus}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Genesys */}
                  <td className='text-foreground px-4 py-4'>
                    {item.genesys === true ? (
                      <CheckCircle2 className='h-4 w-4 text-green-600' />
                    ) : item.genesys === false ? (
                      <XCircle className='h-4 w-4 text-red-500' />
                    ) : (
                      <div className='flex items-center gap-2 text-yellow-500'>
                        <AlertTriangle className='h-8 w-8' />
                        <span className='text-foreground/80 text-[13px]'>
                          {item.genesys}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className='text-muted-foreground mt-8 mb-5 text-center text-xs md:text-sm'>
        {t('table.footerNote')}
      </p>
    </div>
  );
}
