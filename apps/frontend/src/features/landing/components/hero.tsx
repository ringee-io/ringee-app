import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import React from 'react';
import LogoCloud from './logo-cloud';
import {
  GooglePlayButton,
  OpenInBrowserButton,
} from './ui/network.buttons';
import { ProudlyOpenSource } from './proudly-open-source';

const Hero = () => {
  return (
    <div className="flex flex-col items-center px-6 pt-16">
      <div className="flex items-center justify-center md:mt-6">
        <div className="max-w-2xl text-center flex flex-col items-center">
          <ProudlyOpenSource repoUrl="https://github.com/ringee-co/ringee-io" className="mb-6" />

          <Badge className="bg-primary mx-auto flex items-center gap-2 rounded-full border-none py-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-300" />
            Outbound calling · Pay as you go 💰
          </Badge>

          <h1 className="xs:text-4xl mt-6 max-w-[24ch] text-3xl !leading-[1.15] font-bold tracking-tight sm:text-5xl md:text-6xl">
            Simple outbound calling for freelancers and teams
          </h1>

          <p className="mt-6 max-w-[62ch]">
            Call worldwide from your browser or mobile.
            No contracts, no setup — just pay as you go.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <GooglePlayButton />
            <OpenInBrowserButton />
          </div>
        </div>
      </div>
      <LogoCloud className="mx-auto mt-14 max-w-3xl" />
    </div>
  );
};

export default Hero;
