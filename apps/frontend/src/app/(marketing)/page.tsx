import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Check, Github } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import {
  Container,
  CtaButtons,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { ScalabilityCalculator } from '@/features/marketing/components/scalability-calculator';
import {
  JsonLd,
  softwareAppJsonLd
} from '@/features/marketing/components/json-ld';
import { SITE_URL } from '@/features/marketing/site';

export const metadata: Metadata = buildMetadata({
  title: 'Ringee — Affordable, Agentic Outbound Calling Software',
  description:
    'Ringee is low-cost, pay-as-you-go outbound calling software for freelancers and teams. Call leads worldwide from your browser, record and transcribe calls in real time, book meetings to Google Calendar, sync your CRM, and drive it all from Claude, ChatGPT, MCP agents, and the CLI. Open source, no per-seat pricing.',
  path: '/'
});

const PROOF_POINTS = [
  'Free for freelancers, $20/mo for teams',
  'Pay-as-you-go from $0.020/min',
  'Drive it from Claude, ChatGPT, MCP & CLI'
];

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard/overview');

  return (
    <>
      {/* Minimal, premium hero */}
      <Section className='pt-20 pb-16 sm:pt-28'>
        <Container className='grid items-center gap-12 lg:grid-cols-2 lg:gap-16'>
          {/* Copy */}
          <div className='flex flex-col items-center text-center lg:items-start lg:text-left'>
            <Link
              href='/open-source'
              className='border-border/70 bg-background/60 text-muted-foreground hover:text-foreground mb-7 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm'
            >
              <Github className='h-3.5 w-3.5' />
              Open source &amp; self-hostable
            </Link>

            <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl md:text-6xl'>
              The outbound dialer built for the AI era
            </h1>

            <p className='text-muted-foreground mt-6 max-w-xl text-lg text-pretty'>
              Open source and pay-as-you-go from $0.020/min — no per-seat tax.
              Built for freelancers and teams, and driven by your AI: Claude,
              ChatGPT, MCP, and the CLI.
            </p>

            <CtaButtons className='mt-9 items-center justify-center lg:justify-start' />

            <ul className='text-muted-foreground mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm lg:justify-start'>
              {PROOF_POINTS.map((point) => (
                <li key={point} className='inline-flex items-center gap-1.5'>
                  <Check className='h-4 w-4 text-emerald-600 dark:text-emerald-400' />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Product screenshot */}
          <div className='border-border/70 bg-card relative overflow-hidden rounded-2xl border shadow-2xl ring-1 shadow-black/5 ring-black/5 dark:shadow-black/40 dark:ring-white/5'>
            <Image
              src='/hero/white.png'
              alt='Ringee dialer and call workspace'
              width={3022}
              height={1538}
              priority
              sizes='(min-width: 1024px) 50vw, 100vw'
              className='block h-auto w-full dark:hidden'
            />
            <Image
              src='/hero/dark.png'
              alt='Ringee dialer and call workspace'
              width={3016}
              height={2528}
              priority
              sizes='(min-width: 1024px) 50vw, 100vw'
              className='hidden w-full dark:block'
            />
          </div>
        </Container>
      </Section>

      {/* Scalability cost calculator */}
      <Section className='py-16 sm:py-20'>
        <Container>
          <SectionHeading
            eyebrow='Kings of cost-efficiency'
            title='Grow your team, not your bill'
            description='Per-seat tools punish you for hiring. On Ringee a solo user pays no subscription, and a whole team is one flat price — you only pay for the minutes you use, so scaling from 1 to 20 barely moves the bill. Nobody scales outbound cheaper.'
          />
          <div className='mt-10'>
            <ScalabilityCalculator />
          </div>
        </Container>
      </Section>

      <CtaSection />

      <JsonLd
        data={softwareAppJsonLd({
          name: 'Ringee',
          description:
            'Low-cost, pay-as-you-go outbound calling software for freelancers, SDR teams, recruiters, agencies, and startups. Call leads worldwide, run campaigns, record and transcribe calls in real time, book meetings to Google Calendar, sync your CRM, and automate outbound with Claude, ChatGPT, MCP agents, and the CLI. Open source and self-hostable.',
          url: SITE_URL
        })}
      />
    </>
  );
}
