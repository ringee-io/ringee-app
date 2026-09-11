import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { BellRing, Bot, CalendarCheck, Check, Github } from 'lucide-react';

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
import { HumanAiCallingVisual } from '@/features/marketing/components/human-ai-calling';
import { RenderingSwitch } from '@/features/marketing/components/rendering-switch';
import { RunsFrom } from '@/features/marketing/components/agent-marks';
import { AgenticMode } from '@/features/marketing/components/agentic-mode';
import { EverywhereMode } from '@/features/marketing/components/everywhere-mode';
import { AgenticCrmFlow } from '@/features/marketing/components/agentic-crm-flow';
import { ScalabilityCalculator } from '@/features/marketing/components/scalability-calculator';
import { TrustedBy } from '@/features/marketing/components/trusted-by';
import {
  JsonLd,
  softwareAppJsonLd
} from '@/features/marketing/components/json-ld';
import { SITE_URL } from '@/features/marketing/site';

export const metadata: Metadata = buildMetadata({
  title: 'Ringee — Calling Infrastructure for Humans & AI Agents',
  description:
    'Open calling infrastructure where human teams and AI voice agents place real calls from the same stack. Open source, self-hostable, and pay as you go.',
  path: '/'
});

const PROOF_POINTS = [
  'Human and autonomous AI calls',
  'Open source & self-hostable',
  'One shared call history'
];

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard/overview');

  return (
    <>
      {/* Minimal, premium hero. The visual is an ink panel, so the section
          carries a little ambient light of its own — otherwise the render sits
          on the page like a screenshot pasted onto paper. */}
      <Section className='relative overflow-hidden pt-20 pb-16 sm:pt-28'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_78%_38%,rgba(16,185,129,0.1),transparent_70%)]'
        />
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.055)_1px,transparent_0)] [mask-image:radial-gradient(65%_55%_at_50%_35%,black,transparent)] [background-size:24px_24px] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)]'
        />
        <Container className='grid items-center gap-12 lg:grid-cols-[1fr_1.06fr] lg:gap-14'>
          {/* Copy */}
          <div className='flex flex-col items-center text-center lg:items-start lg:text-left'>
            {/* Which rendering you are reading. The other one is /machine. */}
            <RenderingSwitch active='human' className='mb-10' />

            <Link
              href='/open-source'
              className='border-border/70 bg-background/60 text-muted-foreground hover:text-foreground mb-7 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm'
            >
              <Github className='h-3.5 w-3.5' />
              Open source calling infrastructure
            </Link>

            <h1 className='text-[2.05rem] leading-[1.06] font-bold tracking-[-0.03em] text-balance sm:text-[2.9rem] md:text-[3.5rem] lg:text-[3.4rem] lg:leading-[1.03] xl:text-[4rem]'>
              One calling stack.{' '}
              <span className='text-emerald-700 dark:text-emerald-400'>
                Humans and AI agents.
              </span>
            </h1>

            <p className='text-muted-foreground mt-6 max-w-lg text-lg text-pretty sm:text-xl'>
              Ringee is open calling infrastructure where your team and AI voice
              agents place real calls, share the same system of record, and work
              without a per-seat tax.
            </p>

            {/* The agents themselves, so the copy above doesn't have to list
                them. Same row as the one under the loop in Agentic mode. */}
            <RunsFrom className='mt-7 justify-center lg:justify-start' />

            <CtaButtons className='mt-8 items-center justify-center lg:justify-start' />

            <ul className='text-muted-foreground mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm lg:justify-start'>
              {PROOF_POINTS.map((point) => (
                <li key={point} className='inline-flex items-center gap-1.5'>
                  <Check className='h-4 w-4 text-emerald-600 dark:text-emerald-400' />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <HumanAiCallingVisual className='lg:-mr-2 xl:-mr-6' />
        </Container>
      </Section>

      {/* Social proof — companies running outbound on Ringee */}
      <TrustedBy />

      <Section id='ai-voice-agents' className='py-16 sm:py-20'>
        <Container className='grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]'>
          <div>
            <Eyebrow>AI Voice Agents</Eyebrow>
            <h2 className='mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl'>
              When AI should take the call, it can.
            </h2>
            <p className='text-muted-foreground mt-5 text-lg text-pretty'>
              Build an agent with its own voice, instructions, company context,
              and knowledge. It places the outbound call, holds the live
              conversation, uses tools, and returns the recording, transcript,
              summary, outcome, and structured data to Ringee.
            </p>
            <div className='mt-8 flex flex-col gap-3 sm:flex-row'>
              <ButtonLink href='/ai-voice-agents' withArrow>
                Explore AI Voice Agents
              </ButtonLink>
              <ButtonLink
                href='/features/ai-call-automation'
                variant='secondary'
                withArrow
              >
                See AI automation
              </ButtonLink>
            </div>
          </div>

          <div className='grid gap-4 sm:grid-cols-2'>
            <Card className='h-full'>
              <span className='inline-flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300'>
                <CalendarCheck className='h-5 w-5' aria-hidden />
              </span>
              <h3 className='mt-4 text-lg font-semibold'>Book appointments</h3>
              <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                Check real calendar availability during the conversation and
                book only a time the person confirms.
              </p>
            </Card>
            <Card className='h-full'>
              <span className='inline-flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300'>
                <BellRing className='h-5 w-5' aria-hidden />
              </span>
              <h3 className='mt-4 text-lg font-semibold'>Confirm and remind</h3>
              <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                Deliver reminders or updates, hear the response, schedule a
                callback, and bring a human in for follow-up when needed.
              </p>
            </Card>
            <Card className='sm:col-span-2'>
              <div className='flex items-start gap-4'>
                <span className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'>
                  <Bot className='h-5 w-5' aria-hidden />
                </span>
                <div>
                  <h3 className='text-lg font-semibold'>
                    Not a separate stack
                  </h3>
                  <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                    Human and AI calls use Ringee numbers, credits, call
                    history, recordings, transcripts, outcomes, and integration
                    events. Choose the right operator for each conversation.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </Container>
      </Section>

      {/* Ringee everywhere — the same day on web, mobile and the extension */}
      <EverywhereMode />

      {/* Agentic mode — connect once, then the seven-step loop */}
      <AgenticMode />

      {/* Attio, specifically: the same loop, aimed at the agentic CRM */}
      <AgenticCrmFlow />

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
              follow-ups for you. Use a human calling session, or trigger a
              Ringee AI voice agent that places and holds the call.
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
            'Open calling infrastructure where human teams and AI voice agents place outbound calls from the same stack. Run human dialers and autonomous AI conversations with shared numbers, history, recordings, transcripts, outcomes, and integrations. Open source, self-hostable, and pay as you go.',
          url: SITE_URL
        })}
      />
    </>
  );
}
