import type { Metadata } from 'next';
import {
  Apple,
  Bot,
  Chrome,
  Globe,
  MousePointerClick,
  Smartphone,
  Sparkles
} from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { FaqSection } from '@/features/marketing/components/faq';
import {
  ButtonLink,
  Card,
  CheckList,
  Container,
  CtaButtons,
  Eyebrow,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import {
  ANDROID_APP_URL,
  CHROME_EXTENSION_URL,
  DEMO_VIDEO_ID,
  DEMO_VIDEO_URL,
  IOS_APP_URL,
  SIGN_UP_URL
} from '@/features/marketing/site';

export const metadata: Metadata = buildMetadata({
  title: 'Ringee Everywhere — Chrome Extension, iPhone, Android & Web | Ringee',
  description:
    'Use Ringee anywhere: a Chrome extension that calls leads with one click without leaving the page, native iPhone and Android apps, the web app, and outbound from Claude and ChatGPT.',
  path: '/apps'
});

type Platform = {
  name: string;
  icon: typeof Chrome;
  tagline: string;
  href: string;
  cta: string;
  external: boolean;
};

const PLATFORMS: Platform[] = [
  {
    name: 'Chrome extension',
    icon: Chrome,
    tagline:
      'Call with one click without leaving the page you’re on. Ringee finds phone numbers on any site and dials them straight from your browser.',
    href: CHROME_EXTENSION_URL,
    cta: 'Add to Chrome',
    external: true
  },
  {
    name: 'iPhone',
    icon: Apple,
    tagline:
      'Take Ringee with you. Call leads, log outcomes, and handle callbacks from the iOS app on the Apple App Store.',
    href: IOS_APP_URL,
    cta: 'Download on the App Store',
    external: true
  },
  {
    name: 'Android',
    icon: Smartphone,
    tagline:
      'The full Ringee dialer on your Android phone — call, disposition, and follow up while you’re on the move.',
    href: ANDROID_APP_URL,
    cta: 'Get it on Google Play',
    external: true
  },
  {
    name: 'Web app',
    icon: Globe,
    tagline:
      'No install required. Open Ringee in any modern browser at ringee.io and start calling from your desk.',
    href: SIGN_UP_URL,
    cta: 'Start on the web',
    external: false
  },
  {
    name: 'Claude',
    icon: Bot,
    tagline:
      'Drive outbound from a Claude conversation through Ringee’s MCP server — prospect, call, and follow up.',
    href: '/integrations/claude',
    cta: 'See Claude integration',
    external: false
  },
  {
    name: 'ChatGPT',
    icon: Sparkles,
    tagline:
      'Run prep and follow-up from inside ChatGPT. It does the busywork; a human still takes the call.',
    href: '/integrations/chatgpt',
    cta: 'See ChatGPT integration',
    external: false
  }
];

const EXTENSION_POINTS = [
  'Click to call from any page — no copy-paste, no switching tabs',
  'Ringee spots phone numbers on the page and turns them into a call button',
  'Auto-detect on every site, or trigger from the right-click menu',
  'Dial numbers worldwide, formatted correctly wherever you browse',
  'Runs in the Chrome side panel so the dialer stays with you',
  'Same account as the web app — your contacts, caller IDs, and call history'
];

const MOBILE_POINTS = [
  'Native apps for iPhone and Android',
  'Call leads, log outcomes, and add notes on the go',
  'Schedule callbacks and meetings between calls',
  'Pick up where you left off — the same contacts and history as the web'
];

const APPS_FAQS = [
  {
    question: 'Do I need to install anything to use Ringee?',
    answer:
      'No. Ringee runs in any modern web browser at ringee.io — open it and start calling. The Chrome extension and the iPhone and Android apps are optional ways to use Ringee wherever you work.'
  },
  {
    question: 'What does the Chrome extension do?',
    answer:
      'It lets you call with one click without leaving the page you’re on. Ringee detects phone numbers on the site you’re viewing and dials them straight from your browser, using the same dialer, contacts, and call history as the web app.'
  },
  {
    question: 'Is Ringee available on iPhone and Android?',
    answer:
      'Yes. Download the Ringee app from the Apple App Store for iPhone and from Google Play for Android. Both connect to the same Ringee account as the web app.'
  },
  {
    question: 'Can I use Ringee from Claude or ChatGPT?',
    answer:
      'Yes. Ringee ships a Model Context Protocol (MCP) server, so Claude, ChatGPT, and other MCP-compatible agents can prospect leads, start calls, and log outcomes for you. A person always takes the conversation.'
  },
  {
    question: 'Do my contacts and call history sync across apps?',
    answer:
      'Yes. Whether you use the web app, the Chrome extension, or the mobile apps, you sign in to the same Ringee account, so your contacts, caller IDs, and call history stay in sync.'
  },
  {
    question: 'Are the apps and extension free?',
    answer:
      'The Chrome extension and the mobile apps are free to install. You only pay for your Ringee plan — free for freelancers, $20/month for a team — plus pay-as-you-go calling credits from $0.012/min.'
  }
];

export default function AppsPage() {
  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Apps', href: '/apps' }
      ]}
      cta={
        <CtaSection
          title='Start calling — wherever you are'
          description='Create a free Ringee account, add the Chrome extension, and grab the mobile apps. One account works everywhere.'
          primaryLabel='Start calling for free'
          secondaryHref={CHROME_EXTENSION_URL}
          secondaryLabel='Add to Chrome'
        />
      }
    >
      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl'>
          <Eyebrow>Ringee everywhere</Eyebrow>
          <h1 className='mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            Use Ringee anywhere you work
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            Call leads from your browser, your phone, or a one-click Chrome
            extension that dials without taking you off the page you’re on. And
            of course Ringee still works on the web like always — plus Claude
            and ChatGPT. One account, everywhere you sell.
          </p>
          <CtaButtons
            className='mt-8'
            secondaryHref={CHROME_EXTENSION_URL}
            secondaryLabel='Add to Chrome'
          />
        </Container>
      </Section>

      <Section className='pt-6'>
        <Container>
          <SectionHeading
            title='Where Ringee runs'
            description='Pick the surface that fits how you work. Everything signs in to the same Ringee account.'
            align='left'
          />
          <div className='mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
            {PLATFORMS.map((platform) => (
              <Card key={platform.name} className='flex h-full flex-col'>
                <platform.icon className='text-primary h-7 w-7' />
                <h3 className='mt-4 text-lg font-semibold'>{platform.name}</h3>
                <p className='text-muted-foreground mt-2 flex-1 text-sm'>
                  {platform.tagline}
                </p>
                <div className='mt-5'>
                  <ButtonLink
                    href={platform.href}
                    variant='secondary'
                    external={platform.external}
                    withArrow
                    className='h-10 px-4 text-sm'
                  >
                    {platform.cta}
                  </ButtonLink>
                </div>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section className='bg-muted/20'>
        <Container>
          <div className='grid items-center gap-12 lg:grid-cols-2'>
            <div>
              <Eyebrow>Chrome extension</Eyebrow>
              <h2 className='mt-4 text-3xl font-bold tracking-tight text-balance'>
                Call with one click, without leaving the page
              </h2>
              <p className='text-muted-foreground mt-5 text-lg text-pretty'>
                Browsing a prospect list, a LinkedIn profile, or a CRM record?
                The Ringee extension turns any phone number on the page into a
                call button, so you dial straight from your browser — no
                copy-paste, no switching tools.
              </p>
              <CheckList items={EXTENSION_POINTS} className='mt-6' />
              <div className='mt-8'>
                <ButtonLink href={CHROME_EXTENSION_URL} external withArrow>
                  Add Ringee to Chrome
                </ButtonLink>
              </div>
            </div>
            <Card className='flex flex-col gap-4'>
              <div className='flex items-center gap-3'>
                <span className='flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                  <MousePointerClick className='h-6 w-6' />
                </span>
                <div>
                  <p className='font-semibold'>One click to call</p>
                  <p className='text-muted-foreground text-sm'>
                    Detected number → live call
                  </p>
                </div>
              </div>
              <p className='text-muted-foreground text-sm text-pretty'>
                The extension runs the same dialer as the web app inside the
                Chrome side panel. Your contacts, caller IDs, outcomes, and call
                history are all there — wherever you’re browsing.
              </p>
            </Card>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className='grid gap-12 lg:grid-cols-2'>
            <div>
              <Eyebrow>iPhone &amp; Android</Eyebrow>
              <h2 className='mt-4 text-2xl font-bold tracking-tight'>
                Take your calling with you
              </h2>
              <p className='text-muted-foreground mt-4 text-pretty'>
                Native apps put the full Ringee dialer in your pocket. Keep
                calling, dispositioning, and booking follow-ups whether you’re
                at your desk or out of the office.
              </p>
              <CheckList items={MOBILE_POINTS} className='mt-6' />
            </div>
            <div className='flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap lg:flex-col'>
              <ButtonLink href={IOS_APP_URL} external withArrow>
                Download on the App Store
              </ButtonLink>
              <ButtonLink
                href={ANDROID_APP_URL}
                variant='secondary'
                external
                withArrow
              >
                Get it on Google Play
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>

      <Section className='bg-muted/20'>
        <Container>
          <SectionHeading
            eyebrow='AI tools'
            title='And drive Ringee from Claude and ChatGPT'
            description='Ringee ships an MCP server, so your AI can prospect leads, build a call list, start a call, and log the outcome. Agents handle the busywork; a human always takes the call.'
            align='left'
          />
          <div className='mt-10 grid items-center gap-10 lg:grid-cols-2'>
            <div className='border-border/70 bg-card overflow-hidden rounded-2xl border shadow-sm'>
              <div className='aspect-video'>
                <iframe
                  className='h-full w-full'
                  src={`https://www.youtube-nocookie.com/embed/${DEMO_VIDEO_ID}`}
                  title='Ringee running inside Claude'
                  loading='lazy'
                  allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
                  allowFullScreen
                />
              </div>
            </div>
            <div>
              <h3 className='text-xl font-semibold'>See it in Claude</h3>
              <p className='text-muted-foreground mt-3 text-pretty'>
                Watch Ringee run inside Claude: ask it to find leads, queue a
                call, and follow up — all through the same MCP tools available
                to any compatible agent.
              </p>
              <div className='mt-6 flex flex-col gap-3 sm:flex-row'>
                <ButtonLink href='/integrations/claude' withArrow>
                  Claude integration
                </ButtonLink>
                <ButtonLink
                  href='/integrations/chatgpt'
                  variant='secondary'
                  withArrow
                >
                  ChatGPT integration
                </ButtonLink>
              </div>
              <p className='text-muted-foreground mt-4 text-sm'>
                <a
                  href={DEMO_VIDEO_URL}
                  target='_blank'
                  rel='noreferrer noopener'
                  className='underline underline-offset-4'
                >
                  Watch the demo on YouTube
                </a>
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <FaqSection faqs={APPS_FAQS} />
    </DetailLayout>
  );
}
