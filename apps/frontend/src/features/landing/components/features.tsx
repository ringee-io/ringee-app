import {
  IconAccessible,
  IconCreditCard,
  IconDialpad,
  IconPhoneCalling,
  IconPlayerRecord,
  IconWorld
} from '@tabler/icons-react';
import React from 'react';
import { useTranslations } from 'next-intl';

const Features = () => {
  const t = useTranslations('marketing.features');
  const features = [
    {
      icon: IconDialpad,
      title: t('items.smartDialer.title'),
      description: t('items.smartDialer.description')
    },
    {
      icon: IconPhoneCalling,
      title: t('items.buyNumbers.title'),
      description: t('items.buyNumbers.description')
    },
    {
      icon: IconWorld,
      title: t('items.publicNumbers.title'),
      description: t('items.publicNumbers.description')
    },
    {
      icon: IconPlayerRecord,
      title: t('items.encryptedRecording.title'),
      description: t('items.encryptedRecording.description')
    },
    {
      icon: IconAccessible,
      title: t('items.webMobile.title'),
      description: t('items.webMobile.description')
    },
    {
      icon: IconCreditCard,
      title: t('items.billing.title'),
      description: t('items.billing.description')
    }
  ];
  return (
    <div id='features' className='xs:py-20 w-full px-6 py-12'>
      <h2 className='xs:text-4xl text-center text-3xl font-bold tracking-tight sm:text-5xl'>
        {t('title')}
      </h2>
      <div className='mx-auto mt-10 grid w-full max-w-screen-lg gap-6 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3'>
        {features.map((feature) => (
          <div
            key={feature.title}
            className='bg-background flex flex-col rounded-xl border px-5 py-6'
          >
            <div className='bg-muted mb-3 flex h-10 w-10 items-center justify-center rounded-full'>
              <feature.icon className='h-6 w-6' />
            </div>
            <span className='text-lg font-semibold'>{feature.title}</span>
            <p className='text-foreground/80 mt-1 text-[15px]'>
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Features;
