import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BellRing, Bot, CalendarCheck, Check } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import {
  ButtonLink,
  Card,
  Container,
  Eyebrow,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import { FaqSection } from '@/features/marketing/components/faq';
import { CallingHero } from '@/features/marketing/components/calling-hero';
import { AgenticMode } from '@/features/marketing/components/agentic-mode';
import { EverywhereMode } from '@/features/marketing/components/everywhere-mode';
import { AgenticCrmFlow } from '@/features/marketing/components/agentic-crm-flow';
import { ScalabilityCalculator } from '@/features/marketing/components/scalability-calculator';
import { TrustedBy } from '@/features/marketing/components/trusted-by';
import { MarketingVideo } from '@/features/marketing/components/marketing-video';
import { WallOfLoveSection } from '@/features/marketing/components/wall-of-love';
import { FeatureCarouselSection } from '@/features/marketing/components/feature-carousel';
import { AudienceFitSection } from '@/features/marketing/components/audience-fit';
import {
  JsonLd,
  softwareAppJsonLd
} from '@/features/marketing/components/json-ld';
import { PRICING, REQUEST_DEMO_URL, SITE_URL } from '@/features/marketing/site';
import { CALL_RATE_FROM } from '@/features/marketing/content/phone-numbers';

export const metadata: Metadata = buildMetadata({
  title: 'Ringee — AI Outbound Calling Platform for Humans & AI Agents',
  description: `One calling stack for your reps and AI voice agents: a sales dialer, AI outbound calling and bring your own carrier. Open source, calls from ${CALL_RATE_FROM}/min.`,
  path: '/'
});

/** The home FAQ, in reading order; the copy is in `marketing.home.faq`. */
const FAQ_KEYS = [
  'what',
  'cost',
  'perUser',
  'aiAgents',
  'install',
  'carrier',
  'assistants',
  'openSource',
  'start'
] as const;

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard/call');
  const t = await getTranslations('marketing.home');
  const price = PRICING.organization.price;
  const faqs = FAQ_KEYS.map((key) => ({
    question: t(`faq.items.${key}.question`),
    answer: t(`faq.items.${key}.answer`, { price, rate: CALL_RATE_FROM })
  }));

  return (
    <>
      <CallingHero />

      {/* Social proof — companies running outbound on Ringee */}
      <TrustedBy />

      {/* Product tour — the 40-second commercial: 180+ countries, numbers,
          the manual and power dialer, AI voice agents, MCP/CLI/API and the
          team price. The video is English, so its copy has only English
          messages. The container is wider than the page's so the video reads
          at full size; the heading keeps its own narrow column. */}
      <Section id='product-tour' className='py-16 sm:py-20'>
        <Container className='max-w-7xl'>
          <SectionHeading
            eyebrow={t('video.eyebrow')}
            title={t('video.title')}
            description={t('video.description')}
          />
          {/* Never taller than the screen under the navbar, so the whole
              frame and its controls stay in view on a short laptop. */}
          <MarketingVideo
            id='ringee-commercial'
            className='mx-auto mt-10 max-w-[calc((100svh_-_8rem)*16/9)]'
          />
        </Container>
      </Section>

      {/* Features — one card per feature and voice agent, with its use case */}
      <FeatureCarouselSection />

      {/* Wall of love — what people said about Ringee, where they said it */}
      <WallOfLoveSection />

      {/* Who it's for — the reader recognizes their role, or that it isn't */}
      <AudienceFitSection />

      {/* <Section id='ai-voice-agents' className='py-16 sm:py-20'>
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
              <span className='inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'>
                <CalendarCheck className='h-5 w-5' aria-hidden />
              </span>
              <h3 className='mt-4 text-lg font-semibold'>Book appointments</h3>
              <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                Check real calendar availability during the conversation and
                book only a time the person confirms.
              </p>
            </Card>
            <Card className='h-full'>
              <span className='inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'>
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
      </Section> */}

      {/* Ringee everywhere — the same day on web, mobile and the extension */}
      {/* <EverywhereMode /> */}

      {/* Agentic mode — connect once, then the seven-step loop */}
      {/* <AgenticMode /> */}

      {/* Attio, specifically: the same loop, aimed at the agentic CRM */}
      {/* <AgenticCrmFlow /> */}

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

      {/* Simple team pricing — flat team plan next to the cost calculator */}
      <Section
        id='team-pricing'
        className='border-border/50 border-y py-20 sm:py-24'
      >
        <Container>
          <SectionHeading
            eyebrow={t('pricing.eyebrow')}
            title={t('pricing.title')}
            description={t('pricing.description')}
          />
          <div className='mt-10 grid items-stretch gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10'>
            <div className='flex flex-col py-2'>
              <h3 className='text-lg font-semibold'>
                {t('pricing.teamTitle')}
              </h3>
              <p className='mt-4 flex items-baseline gap-3'>
                <span className='text-6xl font-semibold tracking-tight'>
                  ${price}
                </span>
                <span className='text-muted-foreground text-base'>
                  {t('pricing.perMonth')}
                </span>
              </p>
              <p className='mt-3 text-lg font-medium'>
                {t('pricing.teamDescription')}
              </p>
              <ul className='mt-7 space-y-3'>
                {['users', 'campaigns', 'agents'].map((key) => (
                  <li key={key} className='flex items-center gap-3 text-base'>
                    <Check
                      className='h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400'
                      aria-hidden
                    />
                    {t(`pricing.benefits.${key}`)}
                  </li>
                ))}
              </ul>
              <p className='text-muted-foreground mt-6 text-sm leading-relaxed'>
                {t('pricing.usage')}
              </p>
              <ButtonLink
                href='/pricing'
                withArrow
                className='mt-6 w-full sm:w-fit'
              >
                {t('pricing.cta')}
              </ButtonLink>
              <div className='border-border/70 mt-8 border-t pt-6'>
                <h3 className='font-semibold'>{t('pricing.soloTitle')}</h3>
                <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                  {t('pricing.soloDescription')}
                </p>
                <ButtonLink
                  href={REQUEST_DEMO_URL}
                  variant='secondary'
                  className='mt-4 w-full sm:w-auto'
                >
                  {t('pricing.soloCta')}
                </ButtonLink>
              </div>
            </div>
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

      {/* FAQ — the footer's call to action follows it, as on every page */}
      <FaqSection
        layout='split'
        eyebrow={t('faq.eyebrow')}
        title={t('faq.title')}
        description={t('faq.description')}
        faqs={faqs}
      />

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
