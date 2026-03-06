'use client';

import React from 'react';
import { IconRocket, IconMicrophone, IconWorld } from '@tabler/icons-react';

const VideoDemo = () => {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center">
        <h2 className="text-3xl xs:text-4xl font-bold tracking-tight sm:text-5xl">
          See Ringee in Action
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-md text-gray-600 dark:text-gray-400">
          Watch how you can sign up and start making calls in less than a minute.
        </p>
      </div>

      <div className="mt-10 flex items-center justify-center gap-6">
        {/* Left side features */}
        <div className="hidden flex-col gap-6 lg:flex">
          <FeatureCard
            icon={<IconRocket className="h-6 w-6 text-cyan-500" />}
            title="Quick Setup"
            description="Start calling in under 60 seconds"
          />
          <FeatureCard
            icon={<IconMicrophone className="h-6 w-6 text-purple-500" />}
            title="Record Calls"
            description="Never miss important details"
          />
        </div>

        {/* Video container */}
        <div className="group relative w-full max-w-2xl">
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl">
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute inset-0 h-full w-full"
                src="https://www.youtube.com/embed/WiHE9RFmECc"
                title="Ringee Demo - Sign up and start calling in under a minute"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>

        {/* Right side features */}
        <div className="hidden flex-col gap-6 lg:flex">
          <FeatureCard
            icon={<IconWorld className="h-6 w-6 text-green-500" />}
            title="180+ Countries"
            description="Global coverage, local rates"
          />
          <FeatureCard
            icon={
              <span className="text-xl">💰</span>
            }
            title="50× Cheaper"
            description="Pay as you go pricing"
          />
        </div>
      </div>
    </section>
  );
};

const FeatureCard = ({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="flex w-44 flex-col items-center rounded-xl border border-gray-200 bg-gray-100/50 p-4 text-center backdrop-blur-sm transition-all hover:border-gray-300 hover:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10">
    <div className="mb-2 rounded-full bg-gray-200 p-2 dark:bg-white/10">{icon}</div>
    <h3 className="font-semibold">{title}</h3>
    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
  </div>
);

export default VideoDemo;

