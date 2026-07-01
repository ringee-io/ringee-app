import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ArrowRight, Check, Github } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import {
  ButtonLink,
  Card,
  Container,
  CtaButtons,
  Eyebrow,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { ScalabilityCalculator } from '@/features/marketing/components/scalability-calculator';
import { TrustedBy } from '@/features/marketing/components/trusted-by';
import {
  JsonLd,
  softwareAppJsonLd
} from '@/features/marketing/components/json-ld';
import { DOCS_URL, SITE_URL } from '@/features/marketing/site';
import { FEATURES } from '@/features/marketing/content/features';
import {
  INTEGRATIONS,
  integrationsByCategory
} from '@/features/marketing/content/integrations';
import { USE_CASES } from '@/features/marketing/content/use-cases';

export const metadata: Metadata = buildMetadata({
  title: 'Ringee — Affordable, Agentic Outbound Calling Software',
  description:
    'Open-source, pay-as-you-go outbound calling software. Call leads worldwide, record and transcribe calls, and drive it from Claude, ChatGPT and the CLI.',
  path: '/'
});

const PROOF_POINTS = [
  'Free for freelancers, $20/mo for teams',
  'Pay-as-you-go from $0.020/min',
  'Drive it from Claude, ChatGPT, MCP & CLI'
];

const AI_TOOLS = integrationsByCategory('AI tools');

const chip =
  'border-border/70 bg-card hover:border-foreground/30 inline-flex items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors';

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
              {/* A modern low-cost outbound dialer built for modern sales teams */}

              {/* Low-cost outbound dialing for freelancers and teams */}

              Modern, low-cost outbound calling software

              
              {/* The outbound dialer built for the AI era */}
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
              width={3024}
              height={1964}
              priority
              // The hero column is half of the max-w-6xl (1152px) container, so
              // it never exceeds ~560px on desktop. Cap `sizes` there instead of
              // 50vw so wide monitors don't fetch a needlessly large image.
              sizes='(min-width: 1024px) 560px, 100vw'
              className='block h-auto w-full dark:hidden'
            />
            <Image
              src='/hero/dark.png'
              alt='Ringee dialer and call workspace'
              width={3024}
              height={1964}
              priority
              sizes='(min-width: 1024px) 560px, 100vw'
              className='hidden h-auto w-full dark:block'
            />
          </div>
        </Container>
      </Section>

      {/* Social proof — companies running outbound on Ringee */}
      <TrustedBy />

      {/* Full feature catalog — internal linking from the home page */}
      {/* <Section className='py-16 sm:py-20'>
        <Container>
          <SectionHeading
            eyebrow='Everything outbound'
            title='One tool for the entire outbound loop'
            description='Call, record, transcribe, follow up, sync your CRM, and automate the busywork with AI — without stitching together a stack of expensive point tools.'
          />
          <div className='mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
            {FEATURES.map((feature) => (
              <Link key={feature.slug} href={`/features/${feature.slug}`}>
                <Card className='hover:border-foreground/30 flex h-full flex-col transition-colors'>
                  <div className='flex items-center justify-between gap-2'>
                    <feature.icon className='text-primary h-6 w-6' />
                    <ArrowRight className='text-muted-foreground h-4 w-4' />
                  </div>
                  <h3 className='mt-4 text-lg font-semibold'>{feature.name}</h3>
                  <p className='text-muted-foreground mt-2 text-sm'>
                    {feature.tagline}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
          <div className='mt-8 text-center'>
            <Link
              href='/features'
              className='inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400'
            >
              Explore all features <ArrowRight className='h-4 w-4' />
            </Link>
          </div>
        </Container>
      </Section> */}

      {/* Agentic differentiator — text-rich for AI search engines (GEO) */}
      {/* <Section className='bg-muted/20 py-16 sm:py-20'>
        <Container className='grid items-center gap-12 lg:grid-cols-2'>
          <div>
            <Eyebrow>Agentic by design</Eyebrow>
            <h2 className='mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl'>
              Drive outbound from the AI you already use
            </h2>
            <p className='text-muted-foreground mt-5 text-lg text-pretty'>
              Ringee ships a Model Context Protocol (MCP) server, so Claude,
              ChatGPT, any MCP-compatible agent, or the command line can
              prospect leads, build call lists, log outcomes, and book
              follow-ups for you. Agents handle the busywork; a human always
              takes the call.
            </p>
            <div className='mt-8 flex flex-wrap gap-3'>
              <ButtonLink href='/features/ai-call-automation' withArrow>
                See AI automation
              </ButtonLink>
              <ButtonLink
                href={DOCS_URL}
                variant='secondary'
                external
                withArrow
              >
                Developer docs
              </ButtonLink>
            </div>
          </div>
          <div className='grid grid-cols-2 gap-4'>
            {AI_TOOLS.map((tool) => (
              <Link key={tool.slug} href={`/integrations/${tool.slug}`}>
                <Card className='hover:border-foreground/30 flex h-full flex-col transition-colors'>
                  <tool.icon className='text-primary h-6 w-6' />
                  <h3 className='mt-3 font-semibold'>{tool.name}</h3>
                  <p className='text-muted-foreground mt-1 text-sm'>
                    {tool.tagline}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </Container>
      </Section> */}

      {/* Scalability cost calculator */}
      <Section className='py-16 sm:py-20'>
        <Container>
          <SectionHeading
            eyebrow='Cost efficiency'
            title='Grow your team, not your bill'
            description='Per-seat tools punish you for hiring. On Ringee a solo user pays no subscription, and a whole team is one flat $20/month — you only pay for the minutes you use. A 12-person team pays $20/month flat instead of roughly $360/month on a typical ~$30/seat tool: about $4,080 saved per year.'
          />
          <div className='mt-10'>
            <ScalabilityCalculator />
          </div>
        </Container>
      </Section>

      {/* Use cases + integrations — more internal links to money pages */}
      {/* <Section className='py-16 sm:py-20'>
        <Container className='grid gap-12 lg:grid-cols-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>
              Built for outbound freelancers and teams
            </h2>
            <p className='text-muted-foreground mt-2'>
              SDRs, recruiters, agencies, freelancers, and founders run their
              calling on Ringee.
            </p>
            <div className='mt-6 flex flex-wrap gap-2.5'>
              {USE_CASES.map((useCase) => (
                <Link
                  key={useCase.slug}
                  href={`/use-cases/${useCase.slug}`}
                  className={chip}
                >
                  {useCase.name}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>
              Connects to your stack
            </h2>
            <p className='text-muted-foreground mt-2'>
              Pull leads, keep your CRM in sync, and book meetings to your
              calendar — Ringee fits the tools you already use.
            </p>
            <div className='mt-6 flex flex-wrap gap-2.5'>
              {INTEGRATIONS.map((integration) => (
                <Link
                  key={integration.slug}
                  href={`/integrations/${integration.slug}`}
                  className={chip}
                >
                  {integration.name}
                </Link>
              ))}
            </div>
          </div>
        </Container>
      </Section> */}

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
