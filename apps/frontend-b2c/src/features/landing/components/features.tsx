import {
  IconAccessible,
  IconCreditCard,
  IconDialpad,
  IconPhoneCalling,
  IconPlayerRecord,
  IconWorld
} from '@tabler/icons-react';
import React from 'react';

const features = [
  {
    icon: IconDialpad,
    title: 'Smart Dialer',
    description:
      'Make calls worldwide in seconds with HD quality and real-time call analytics.'
  },
  {
    icon: IconPhoneCalling,
    title: 'Buy Local & International Numbers',
    description:
      'Get verified numbers from multiple countries to expand your reach and manage different brands.'
  },
  {
    icon: IconWorld,
    title: 'Public Numbers Ready to Use',
    description:
      'Start calling instantly from a shared Ringee public number—no setup required.'
  },
  {
    icon: IconPlayerRecord,
    title: 'Encrypted Call Recording',
    description:
      'Record your calls with full encryption. Each recording is stored securely and only accessible from your Ringee account by you and your authorized team members.'
  },
  {
    icon: IconAccessible,
    title: 'Web & Mobile Access',
    description:
      'Use Ringee directly from your browser or Android app with full sync across devices.'
  },
  {
    icon: IconCreditCard,
    title: 'Credit & Billing Control',
    description:
      'Track your balance, costs, and top-ups with transparent per-minute pricing.'
  }
];

const Features = () => {
  return (
    <div id="features" className="xs:py-20 w-full px-6 py-12">
      <h2 className="xs:text-4xl text-center text-3xl font-bold tracking-tight sm:text-5xl">
        Power Your Calls with Ringee.io
      </h2>
      <div className="mx-auto mt-10 grid w-full max-w-screen-lg gap-6 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="bg-background flex flex-col rounded-xl border px-5 py-6"
          >
            <div className="bg-muted mb-3 flex h-10 w-10 items-center justify-center rounded-full">
              <feature.icon className="h-6 w-6" />
            </div>
            <span className="text-lg font-semibold">{feature.title}</span>
            <p className="text-foreground/80 mt-1 text-[15px]">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Features;
