'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Check, ChevronDown, Info, Sparkles, Workflow } from 'lucide-react';
import {
  getPipelineIcon,
  hasPipelineContent,
  type PipelineContent
} from '../pipeline-content';

/**
 * "About this pipeline" panel shown at the top of every pipeline detail page.
 * It explains what the pipeline does, how it works and what the user gets, so
 * the value is clear before they enable a context. Collapsible (open by
 * default) so it stays out of the way once they are working. All copy comes
 * from the `ai` i18n namespace.
 */
export function PipelineIntro({ type }: { type: string }) {
  const t = useTranslations('ai');
  const [open, setOpen] = useState(true);

  if (!hasPipelineContent(type)) return null;
  const Icon = getPipelineIcon(type);
  const content = t.raw(`pipelines.${type}`) as PipelineContent;

  return (
    <Card className='overflow-hidden'>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className='hover:bg-muted/30 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5'
      >
        <div className='bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg'>
          <Icon className='h-5 w-5' />
        </div>
        <div className='min-w-0 flex-1'>
          <div className='text-sm font-semibold'>
            {t('pipelineIntro.heading')}
          </div>
          <p className='text-muted-foreground truncate text-sm'>
            {content.tagline}
          </p>
        </div>
        <span className='border-primary/30 bg-primary/5 text-primary mr-1 hidden items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap sm:inline-flex'>
          <Sparkles className='h-3.5 w-3.5' />
          {t('pipelineIntro.modelBadge')}
        </span>
        <ChevronDown
          className={cn(
            'text-muted-foreground h-4 w-4 shrink-0 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <CardContent className='space-y-6 border-t pt-5'>
          <p className='text-sm leading-relaxed'>{content.summary}</p>

          <div className='grid gap-6 lg:grid-cols-2'>
            {/* How it works */}
            <div className='space-y-3'>
              <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase'>
                <Workflow className='h-3.5 w-3.5' />
                {t('pipelineIntro.howItWorks')}
              </div>
              <ol className='space-y-3'>
                {content.howItWorks.map((step, i) => (
                  <li key={i} className='flex gap-3'>
                    <span className='bg-primary/10 text-primary mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold'>
                      {i + 1}
                    </span>
                    <div>
                      <div className='text-sm font-medium'>{step.title}</div>
                      <p className='text-muted-foreground text-sm'>
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* What you get */}
            <div className='space-y-3'>
              <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase'>
                <Check className='h-3.5 w-3.5' />
                {t('pipelineIntro.whatYouGet')}
              </div>
              <ul className='space-y-2'>
                {content.benefits.map((benefit, i) => (
                  <li key={i} className='flex gap-2 text-sm'>
                    <Check className='mt-0.5 h-4 w-4 shrink-0 text-green-600' />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className='border-t pt-4'>
            <dl className='grid gap-4 sm:grid-cols-2'>
              <div>
                <dt className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
                  {t('pipelineIntro.bestFor')}
                </dt>
                <dd className='mt-1 text-sm'>{content.bestFor}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground flex items-center gap-1 text-xs font-semibold tracking-wide uppercase'>
                  <Info className='h-3.5 w-3.5' />
                  {t('pipelineIntro.whatItNeeds')}
                </dt>
                <dd className='mt-1 text-sm'>{content.dataNote}</dd>
              </div>
            </dl>
          </div>

          {/* Powered-by banner — names the model that drives the analysis. */}
          <div className='border-primary/20 from-primary/5 text-foreground/80 flex items-center gap-2 rounded-lg border bg-gradient-to-r to-transparent px-3 py-2.5 text-sm'>
            <Sparkles className='text-primary h-4 w-4 shrink-0' />
            <span>{t('pipelineIntro.poweredBy')}</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
