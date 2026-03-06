import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import React from 'react';
import LogoCloud from './logo-cloud';
import { ProudlyOpenSource } from './proudly-open-source';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

const Hero = () => {
  return (
    <div className="flex flex-col items-center px-6 pt-16">
      <div className="flex items-center justify-center md:mt-6">
        <div className="max-w-2xl text-center flex flex-col items-center">
          <ProudlyOpenSource repoUrl="https://github.com/ringee-io/ringee-app" className="mb-6" />

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
          
          <div className="mt-10 flex w-full justify-center gap-4 sm:gap-6">
            <Link
              href="/auth/sign-in"
              className="group relative inline-flex h-12 sm:h-14 w-full max-w-[220px] sm:max-w-[260px] items-center justify-center overflow-hidden rounded-lg bg-neutral-900/70 px-6 font-medium text-primary-foreground shadow-[0_0_30px_-8px_rgba(0,0,0,0.2)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_35px_-5px_rgba(0,0,0,0.4)] dark:shadow-[0_0_30px_-8px_rgba(255,255,255,0.1)] dark:hover:shadow-[0_0_35px_-5px_rgba(255,255,255,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
              aria-label="Start a free call now"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_3s_infinite] -translate-x-full" />
              
              <span className="relative flex items-center gap-2 text-base sm:text-lg font-bold">
                <span className="h-4 w-4 animate-[pulse_8s_cubic-bezier(0.4,0,0.6,1)_infinite] text-yellow-300" aria-hidden="true" />
                Try a Free Call
                <ArrowUpRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" aria-hidden="true" />
              </span>
            </Link>
          </div>

        </div>
      </div>
      <LogoCloud className="mx-auto mt-14 max-w-3xl" />
    </div>
  );
};

export default Hero;
