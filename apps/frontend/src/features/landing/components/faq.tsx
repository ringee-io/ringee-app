'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@ringee/frontend-shared/components/ui/accordion';
import { useTranslations } from 'next-intl';
import {
  Phone,
  ShieldCheck,
  CreditCard,
  Wifi,
  Zap,
  Globe,
  Info
} from 'lucide-react';

export default function FAQ() {
  const t = useTranslations('marketing.faq');
  const faq = [
    { icon: Wifi, key: 'browserCalling' },
    { icon: Phone, key: 'incomingCalls' },
    { icon: Zap, key: 'sms' },
    { icon: Globe, key: 'pricing' },
    { icon: Info, key: 'vsApps' },
    { icon: ShieldCheck, key: 'privacy' },
    { icon: CreditCard, key: 'subscription' },
    { icon: CreditCard, key: 'addCredit' },
    { icon: Wifi, key: 'callQuality' }
  ] as const;

  return (
    <section
      id='faq'
      className='xs:py-20 flex flex-col items-center justify-center px-6 py-12'
    >
      <div className='w-full max-w-screen-lg'>
        <h2 className='xs:text-4xl text-center text-3xl font-bold tracking-tight md:text-5xl'>
          {t('title')}
        </h2>
        <p className='xs:text-lg text-muted-foreground mt-3 mb-8 text-center'>
          {t('subtitle')}
        </p>

        <Accordion type='single' collapsible className='w-full'>
          {faq.map(({ key, icon: Icon }, i) => (
            <AccordionItem
              key={key}
              value={`item-${i}`}
              className='border-border/60 border-b py-3'
            >
              <AccordionTrigger className='text-left hover:no-underline'>
                <div className='flex items-center gap-3'>
                  <div className='bg-accent flex h-8 w-8 items-center justify-center rounded-full'>
                    <Icon className='h-4 w-4' />
                  </div>
                  <span className='text-base font-medium md:text-lg'>
                    {t(`items.${key}.question`)}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className='text-muted-foreground pl-11 text-sm leading-relaxed md:text-base'>
                {t(`items.${key}.answer`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
