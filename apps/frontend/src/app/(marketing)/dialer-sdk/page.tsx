import type { Metadata } from 'next';
import {
  Boxes,
  Braces,
  Code2,
  Fingerprint,
  Gauge,
  Globe2,
  KeyRound,
  Languages,
  MicVocal,
  PanelBottom,
  Paintbrush,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  SquareDashedBottomCode,
  Wallet
} from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { FaqSection } from '@/features/marketing/components/faq';
import { CodeBlock } from '@/features/marketing/components/code-block';
import {
  SdkLiveDemo,
  SdkStateGallery
} from '@/features/marketing/components/sdk-demo';
import {
  JsonLd,
  softwareSourceCodeJsonLd
} from '@/features/marketing/components/json-ld';
import {
  ButtonLink,
  Card,
  CheckList,
  Container,
  Eyebrow,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import {
  DOCS_DIALER_SDK_QUICKSTART_URL,
  DOCS_DIALER_SDK_URL,
  GITHUB_URL,
  SDK_NPM_URL,
  SIGN_UP_URL,
  SITE_URL
} from '@/features/marketing/site';

export const metadata: Metadata = buildMetadata({
  title: 'Dialer SDK — Embed Ringee Calling in Your CRM or App | Ringee',
  description:
    'Add outbound calling to any web app with @ringee/dialer-sdk. A floating dialer, an inline bar, or a headless engine — no React dependency, no Telnyx or WebRTC credentials to manage. Open source and MIT-licensed.',
  path: '/dialer-sdk'
});

const INSTALL_SNIPPET = `npm install @ringee/dialer-sdk`;

const CDN_SNIPPET = `<script src="https://unpkg.com/@ringee/dialer-sdk"></script>
<script>
  const ringee = Ringee.mount({ key: "pk_live_xxxxx" });

  // Call whoever the CRM is showing right now
  ringee.startCall({
    to: "+13055550142",
    name: "Morgan Reed",
    externalContactId: "crm-contact-294"
  });
</script>`;

const FLOATING_SNIPPET = `import { createFloating } from "@ringee/dialer-sdk/ui";

const ringee = createFloating({
  key: "pk_live_xxxxx",
  agentEmail: currentUser.email,
  locale: "en",
  side: "right",
  allowHold: true
});

ringee.open();`;

const BAR_SNIPPET = `import { createBar } from "@ringee/dialer-sdk/ui";

const bar = createBar({
  key: "pk_live_xxxxx",
  container: "#ringee-bar"
});

bar.setContact({
  name: "Avery Stone",
  number: "+14155550142",
  externalContactId: "contact-802"
});`;

const HEADLESS_SNIPPET = `import { RingeeDialer } from "@ringee/dialer-sdk";

const dialer = new RingeeDialer({ key: "pk_live_xxxxx" });

// Subscribe before initialize() so no state change is missed
dialer.on("authRequired", () => showEmailForm());
dialer.on("ready", () => enableDialButton());
dialer.on("answered", ({ call }) => startTimer(call.answeredAt));
dialer.on("ended", ({ call }) => showSummary(call));
dialer.on("failed", ({ error }) => showError(error.code));

await dialer.initialize();
await dialer.call({ to: "+13055550198" });`;

const CONTACT_SNIPPET = `ringee.setContact({
  name: "Morgan Reed",
  number: "+13055550142",
  imageUrl: "https://crm.example.com/avatars/294.png",
  externalContactId: "crm-contact-294"
});

// Or just drop a number into the field
ringee.prefill("+13055550142");`;

const THEME_SNIPPET = `const ringee = createFloating({
  key: "pk_live_xxxxx",
  locale: "en", // "es" also ships
  theme: {
    primary: "#4f46e5",
    primaryHover: "#4338ca",
    radius: "14px",
    fontFamily: "Inter, sans-serif",
    colorScheme: "auto"
  },
  strings: {
    callButton: "Call prospect"
  }
});

// Follow your app's theme switcher at runtime
ringee.setTheme({ colorScheme: "dark" });`;

const REACT_SNIPPET = `"use client";

import { useEffect, useRef } from "react";
import type { FloatingController } from "@ringee/dialer-sdk/ui";

export function RingeeDialer({ email }: { email: string }) {
  const controller = useRef<FloatingController | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Dynamic import keeps the browser-only package out of SSR
    void import("@ringee/dialer-sdk/ui").then(({ createFloating }) => {
      if (cancelled) return;
      controller.current = createFloating({
        key: process.env.NEXT_PUBLIC_RINGEE_KEY!,
        agentEmail: email
      });
    });

    return () => {
      cancelled = true;
      const current = controller.current;
      controller.current = null;
      current?.destroy();
      void current?.dialer.destroy();
    };
  }, [email]);

  return null;
}`;

const CSP_SNIPPET = `script-src 'self' https://unpkg.com;
connect-src 'self'
  https://api.ringee.io
  wss://rtc.telnyx.com;
media-src 'self' blob:;`;

const SELF_HOST_SNIPPET = `createFloating({
  key: "pk_live_xxxxx",
  apiUrl: "https://api.acme.com"
});`;

type Mode = {
  name: string;
  icon: typeof Code2;
  best: string;
  description: string;
  points: string[];
};

const MODES: Mode[] = [
  {
    name: 'Floating',
    icon: PhoneCall,
    best: 'Fastest path to calling',
    description:
      'A launcher docks in the corner of your app and opens a full dialer panel: agent sign-in, caller ID, number entry, keypad, and in-call controls.',
    points: [
      'One call to createFloating() — or a single CDN script tag',
      'open(), close(), toggle(), startCall() from your own buttons',
      'Left or right side, opened by default or remembered per tab'
    ]
  },
  {
    name: 'Inline bar',
    icon: PanelBottom,
    best: 'Toolbars and record pages',
    description:
      'The same dialer rendered inside an element you already own. It adapts to the available width and never floats over your layout.',
    points: [
      'Mount into an element, an id, or any CSS selector',
      'Sits inside a sidebar, a toolbar, or a contact record',
      'Same contact, theming, and event API as Floating'
    ]
  },
  {
    name: 'Headless',
    icon: Braces,
    best: 'Fully custom interfaces',
    description:
      'No UI at all. You get authentication, calls, devices, states, and typed events, and you build every screen yourself.',
    points: [
      'Typed state machines for auth and call lifecycle',
      'Events for dialing, ringing, answered, held, ended, failed',
      'RingeeError with a code and a retryable flag on every rejection'
    ]
  }
];

const HANDLED = [
  {
    icon: MicVocal,
    title: 'WebRTC and telephony',
    body: 'Microphone capture, remote audio, device selection, reconnects, and the Telnyx leg are all inside the SDK. No SIP passwords or provider JWTs ever reach your frontend.'
  },
  {
    icon: Fingerprint,
    title: 'Agent identity',
    body: 'Agents prove who they are with a one-time code sent to their email. Your publishable key identifies the installation, never a person.'
  },
  {
    icon: Boxes,
    title: 'Style isolation',
    body: 'The bundled UIs render inside a Shadow DOM, so your CSS cannot leak into the dialer and the dialer cannot leak into your app.'
  },
  {
    icon: Languages,
    title: 'Copy and locales',
    body: 'English and Spanish ship in the box, every label can be overridden, and backend error codes are turned into plain, actionable sentences.'
  },
  {
    icon: Gauge,
    title: 'Call state',
    body: 'Dialing, ringing, active, held, reconnecting, ending, ended — mapped from provider events into one stable state machine you can render.'
  },
  {
    icon: Globe2,
    title: 'One call at a time',
    body: 'A browser lock stops a second tab from dialing over a live call, and the server enforces the same rule again.'
  }
];

const PLATFORM_POINTS = [
  'Calls land in your Ringee call history like any other call',
  'Your workspace’s recording and transcription settings apply unchanged',
  'Caller ID rotation picks a local-presence number when it’s enabled',
  'Credit, DNC, and permission checks run server-side before the call connects',
  'Custom Integration webhooks fire, so your CRM stays in sync',
  'Pass externalContactId and Ringee resolves it to the right contact'
];

const SECURITY_POINTS = [
  'The pk_live_… key is signed and scoped to the exact origins you list',
  'Origins match exactly — no wildcards, no paths, no implicit subdomains',
  'Every agent is verified by email OTP before a call is authorized',
  'Workspace membership, caller ID, credit, DNC, and blocks are checked server-side',
  'Sessions live in sessionStorage; WebRTC credentials stay in memory only',
  'Your cik_live_… API key and webhook secret never belong in frontend code'
];

const NOT_INCLUDED = [
  'There’s no public Ringee URL to drop straight into an iframe src',
  'There’s no automatic data-ringee-key loader — you call mount() yourself',
  'There’s no separate React wrapper package; mount from useEffect as shown above'
];

const SDK_FAQS = [
  {
    question: 'What is the Ringee Dialer SDK?',
    answer:
      '@ringee/dialer-sdk is a browser SDK that embeds Ringee outbound calling into any web application — a CRM, a back office, or an internal tool. It ships three integration modes: a floating dialer, an inline bar, and a headless engine with no UI. It is open source under the MIT license and published on npm.'
  },
  {
    question: 'Do I need React to use it?',
    answer:
      'No. The SDK has no React dependency and renders its UI inside a Shadow DOM, so it works with plain JavaScript, TypeScript, React, Vue, Angular, Svelte, or a server-rendered page with a single script tag. In React or Next.js you mount it from a useEffect and destroy it on unmount.'
  },
  {
    question: 'Is the publishable key safe to put in frontend code?',
    answer:
      'Yes. A pk_live_… publishable key is designed to be visible in the browser. It is signed, scoped to an exact list of allowed origins, and it does not authenticate an agent on its own — Ringee still verifies the agent with an email one-time code and validates permissions, caller ID, credit, and DNC on the server. The private cik_live_… API key and webhook secret are different credentials and must never be shipped to a browser.'
  },
  {
    question: 'Do I have to manage Telnyx or WebRTC credentials?',
    answer:
      'No. The SDK encapsulates WebRTC and Telnyx entirely. Your application never sees SIP passwords, provider tokens, or provider-specific objects — it only calls Ringee methods and reacts to Ringee events.'
  },
  {
    question: 'How do agents sign in?',
    answer:
      'The agent enters their email address and Ringee sends a one-time code. Once verified, Ringee checks that the agent belongs to the integration’s workspace and is allowed to call, then issues a session and temporary WebRTC credentials. The session is stored in sessionStorage for that tab, so a reload does not force a new code.'
  },
  {
    question: 'Do calls placed through the SDK show up in Ringee?',
    answer:
      'Yes. An SDK call is a normal Ringee call. It appears in call history, uses the same pay-as-you-go calling credits, follows your workspace’s recording and transcription settings, respects caller ID rotation, and triggers the same Custom Integration webhooks — so your CRM stays in sync without extra work.'
  },
  {
    question: 'How much does the Dialer SDK cost?',
    answer:
      'The SDK itself is free and MIT-licensed — there is no separate SDK fee. Calls placed through it consume the same pay-as-you-go calling credits as any other Ringee call, from $0.012/min depending on the destination.'
  },
  {
    question: 'Can I use it with a self-hosted Ringee?',
    answer:
      'Yes. Pass your API base origin as the apiUrl option (without the /api suffix) and the SDK talks to your deployment instead of api.ringee.io. The same option points the SDK at a local backend during development.'
  },
  {
    question: 'What do browsers need for it to work?',
    answer:
      'A modern browser with WebRTC and navigator.mediaDevices, plus a secure context — HTTPS in production, or localhost while developing. Microphone permission is requested when the first call starts. If the SDK runs inside an iframe, the host page must grant microphone access with allow="microphone".'
  }
];

export default function DialerSdkPage() {
  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Dialer SDK', href: '/dialer-sdk' }
      ]}
      cta={
        <CtaSection
          title='Put a dialer in your product this afternoon'
          description='Create a free Ringee account, generate a publishable key for your origin, and drop in the SDK. Calling credits are pay-as-you-go — the SDK is free.'
          primaryLabel='Request Demo'
          secondaryHref={SDK_NPM_URL}
          secondaryLabel='View on npm'
        />
      }
    >
      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl'>
          <Eyebrow>Dialer SDK</Eyebrow>
          <h1 className='mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            Embed Ringee calling in your own app
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            <code className='font-mono text-base'>@ringee/dialer-sdk</code>{' '}
            drops a working dialer into your CRM, back office, or internal tool
            — floating, inline, or fully headless. No React dependency, no
            Telnyx credentials in your frontend, no WebRTC plumbing to maintain.
          </p>
          <div className='mt-8'>
            <CodeBlock code={INSTALL_SNIPPET} label='Terminal' />
          </div>
          <div className='mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4'>
            <ButtonLink href={SIGN_UP_URL} withArrow>
              Get a publishable key
            </ButtonLink>
            <ButtonLink
              href={DOCS_DIALER_SDK_QUICKSTART_URL}
              variant='secondary'
              external
              withArrow
            >
              Read the docs
            </ButtonLink>
            <ButtonLink
              href={SDK_NPM_URL}
              variant='secondary'
              external
              withArrow
            >
              View on npm
            </ButtonLink>
          </div>
          <p className='text-muted-foreground mt-4 text-sm'>
            MIT-licensed and open source, like the rest of Ringee.
          </p>
        </Container>
      </Section>

      <Section id='integration-modes' className='pt-8'>
        <Container>
          <SectionHeading
            title='Three ways to embed the dialer'
            description='Start with Floating for the fastest result, use the Bar when your app already has a place for calling, and go Headless when you want to design every screen yourself.'
            align='left'
          />
          <div className='mt-10 grid gap-5 lg:grid-cols-3'>
            {MODES.map((mode) => (
              <Card key={mode.name} className='flex h-full flex-col'>
                <mode.icon className='text-primary h-7 w-7' />
                <h3 className='mt-4 text-lg font-semibold'>{mode.name}</h3>
                <p className='mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400'>
                  {mode.best}
                </p>
                <p className='text-muted-foreground mt-3 text-sm text-pretty'>
                  {mode.description}
                </p>
                <ul className='mt-4 flex flex-1 flex-col gap-2'>
                  {mode.points.map((point) => (
                    <li
                      key={point}
                      className='text-muted-foreground flex gap-2 text-sm'
                    >
                      <span
                        className='mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-500'
                        aria-hidden
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section id='screens'>
        <Container>
          <SectionHeading
            eyebrow='The real UI'
            title='Every screen, already built'
            description='Sign-in, the one-time code, caller ID selection, the keypad, live call controls, the call summary, and readable errors — all shipped and themeable. Everything below is the actual package running on this page, not a screenshot.'
            align='left'
          />
          <SdkLiveDemo className='mt-10' />
          <SdkStateGallery className='mt-5' />
          <p className='text-muted-foreground mt-6 text-sm text-pretty'>
            The demo runs the production components against a simulated dialer,
            so no call is placed and no data leaves the page. Headless mode
            gives you the same states with no UI at all.
          </p>
        </Container>
      </Section>

      <Section id='quickstart' className='bg-muted/20'>
        <Container>
          <SectionHeading
            eyebrow='Quickstart'
            title='A dialer in a few lines'
            description='One script tag if you have no build step, one import if you do. The UI initializes itself, handles agent sign-in, and is ready to place a call.'
            align='left'
          />
          <div className='mt-10 grid gap-8'>
            <div className='flex flex-col gap-3'>
              <h3 className='text-sm font-semibold'>
                Floating, straight from a CDN
              </h3>
              <CodeBlock
                code={CDN_SNIPPET}
                label='index.html'
                language='html'
              />
              <p className='text-muted-foreground text-sm'>
                Pin a version in production so a host deployment never picks up
                an unexpected release.
              </p>
            </div>
            <div className='flex flex-col gap-3'>
              <h3 className='text-sm font-semibold'>Floating, from npm</h3>
              <CodeBlock
                code={FLOATING_SNIPPET}
                label='dialer.ts'
                language='ts'
              />
              <p className='text-muted-foreground text-sm'>
                <code className='font-mono'>agentEmail</code> only prefills the
                field — Ringee always verifies the agent with a one-time code.
              </p>
            </div>
            <div className='flex flex-col gap-3'>
              <h3 className='text-sm font-semibold'>
                Inline bar in a container
              </h3>
              <CodeBlock code={BAR_SNIPPET} label='sidebar.ts' language='ts' />
            </div>
            <div className='flex flex-col gap-3'>
              <h3 className='text-sm font-semibold'>Headless engine</h3>
              <CodeBlock
                code={HEADLESS_SNIPPET}
                label='engine.ts'
                language='ts'
              />
            </div>
          </div>
        </Container>
      </Section>

      <Section id='what-you-skip'>
        <Container>
          <SectionHeading
            title='What you don’t have to build'
            description='Browser calling is mostly edge cases. The SDK owns them so your team can stay on the product.'
            align='left'
          />
          <div className='mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
            {HANDLED.map((item) => (
              <Card key={item.title} className='flex h-full flex-col'>
                <span className='flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                  <item.icon className='h-5 w-5' />
                </span>
                <h3 className='mt-4 font-semibold'>{item.title}</h3>
                <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                  {item.body}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section id='crm-contacts' className='bg-muted/20'>
        <Container>
          <div className='grid items-start gap-8'>
            <div className='max-w-3xl'>
              <Eyebrow>CRM contacts</Eyebrow>
              <h2 className='mt-4 text-3xl font-bold tracking-tight text-balance'>
                The dialer follows the record on screen
              </h2>
              <p className='text-muted-foreground mt-5 text-lg text-pretty'>
                Hand the SDK whichever contact your app is displaying and the
                panel fills in the name, avatar, and number. Send your own CRM
                id as{' '}
                <code className='font-mono text-sm'>externalContactId</code> and
                Ringee links the call to the matching contact — no id mapping
                table on your side.
              </p>
              <CheckList
                className='mt-6'
                items={[
                  'setContact() attaches name, number, avatar, and ids',
                  'prefill() drops a number into the field without a contact',
                  'startCall() dials immediately — even before the session finishes restoring',
                  'contactId works too when you already know the Ringee UUID'
                ]}
              />
            </div>
            <CodeBlock
              code={CONTACT_SNIPPET}
              label='crm-record.ts'
              language='ts'
            />
          </div>
        </Container>
      </Section>

      <Section id='theming'>
        <Container>
          <div className='grid items-start gap-8'>
            <div className='max-w-3xl'>
              <Eyebrow>Customization</Eyebrow>
              <h2 className='mt-4 text-3xl font-bold tracking-tight text-balance'>
                Make it look like your product
              </h2>
              <p className='text-muted-foreground mt-5 text-lg text-pretty'>
                Colors, radius, shadow, and font are theme tokens you can set at
                mount time, change at runtime, or drive from CSS custom
                properties such as{' '}
                <code className='font-mono text-sm'>--ringee-primary</code>. The
                color scheme follows the host page, or you pin it to light or
                dark.
              </p>
            </div>
            <CodeBlock code={THEME_SNIPPET} label='theme.ts' language='ts' />
            <div>
              <div className='grid gap-4 sm:grid-cols-2'>
                <Card className='p-5'>
                  <Paintbrush className='h-5 w-5 text-emerald-600 dark:text-emerald-400' />
                  <h3 className='mt-3 text-sm font-semibold'>Themeable</h3>
                  <p className='text-muted-foreground mt-1.5 text-sm'>
                    Primary, surface, text, border, danger, success, warning,
                    radius, shadow, and font family.
                  </p>
                </Card>
                <Card className='p-5'>
                  <Languages className='h-5 w-5 text-emerald-600 dark:text-emerald-400' />
                  <h3 className='mt-3 text-sm font-semibold'>
                    Your words, two locales
                  </h3>
                  <p className='text-muted-foreground mt-1.5 text-sm'>
                    English and Spanish ship in the box, and any individual
                    label can be replaced with{' '}
                    <code className='font-mono text-xs'>strings</code>.
                  </p>
                </Card>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <Section id='frameworks' className='bg-muted/20'>
        <Container>
          <div className='grid items-start gap-8'>
            <div className='max-w-3xl'>
              <Eyebrow>Any stack</Eyebrow>
              <h2 className='mt-4 text-3xl font-bold tracking-tight text-balance'>
                React, Next.js, or no framework at all
              </h2>
              <p className='text-muted-foreground mt-5 text-lg text-pretty'>
                The package is browser-only and framework-agnostic. In React or
                Next.js, mount it inside a{' '}
                <code className='font-mono text-sm'>useEffect</code> with a
                dynamic import so it never runs during SSR, and destroy the
                controller on unmount.
              </p>
              <CheckList
                className='mt-6'
                items={[
                  'ESM and CommonJS builds, plus a self-contained CDN bundle that exposes window.Ringee',
                  'TypeScript types for every option, state, event, and error',
                  'Shadow DOM rendering keeps your CSS and the dialer’s apart',
                  'destroy() releases the UI, WebRTC, audio, and the call lock'
                ]}
              />
              <div className='mt-8 flex flex-col gap-3 sm:flex-row'>
                <ButtonLink href={DOCS_DIALER_SDK_URL} external withArrow>
                  Developer docs
                </ButtonLink>
                <ButtonLink
                  href={GITHUB_URL}
                  variant='secondary'
                  external
                  withArrow
                >
                  Source on GitHub
                </ButtonLink>
              </div>
            </div>
            <CodeBlock
              code={REACT_SNIPPET}
              label='ringee-dialer.tsx'
              language='tsx'
            />
          </div>
        </Container>
      </Section>

      <Section id='real-ringee-calls'>
        <Container>
          <div className='grid items-start gap-10 lg:grid-cols-2'>
            <div>
              <Eyebrow>Not a side channel</Eyebrow>
              <h2 className='mt-4 text-3xl font-bold tracking-tight text-balance'>
                Every SDK call is a real Ringee call
              </h2>
              <p className='text-muted-foreground mt-5 text-lg text-pretty'>
                The SDK is a thin front end over the same calling pipeline the
                Ringee web app and Chrome extension use. Nothing is duplicated,
                so nothing drifts: the same checks run before a call connects
                and the same records come out the other side.
              </p>
              <CheckList className='mt-6' items={PLATFORM_POINTS} />
            </div>
            <div className='flex flex-col gap-5'>
              <Card className='flex gap-4'>
                <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                  <Wallet className='h-5 w-5' />
                </span>
                <div>
                  <h3 className='font-semibold'>One balance, no SDK fee</h3>
                  <p className='text-muted-foreground mt-1.5 text-sm text-pretty'>
                    Calls from your app draw on the same pay-as-you-go credits
                    as everything else in Ringee. There is no separate charge
                    for embedding the dialer.
                  </p>
                </div>
              </Card>
              <Card className='flex gap-4'>
                <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                  <Sparkles className='h-5 w-5' />
                </span>
                <div>
                  <h3 className='font-semibold'>
                    Recording, transcription, outcomes
                  </h3>
                  <p className='text-muted-foreground mt-1.5 text-sm text-pretty'>
                    Whatever your workspace already does with a call keeps
                    happening — recordings, real-time transcripts, outcomes, and
                    CRM sync — for calls placed from your own interface.
                  </p>
                </div>
              </Card>
              <Card className='flex gap-4'>
                <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                  <SquareDashedBottomCode className='h-5 w-5' />
                </span>
                <div>
                  <h3 className='font-semibold'>Self-hosted friendly</h3>
                  <p className='text-muted-foreground mt-1.5 text-sm text-pretty'>
                    Point the SDK at your own deployment with a single option.
                  </p>
                  <div className='mt-3'>
                    <CodeBlock code={SELF_HOST_SNIPPET} language='ts' />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </Container>
      </Section>

      <Section id='security' className='bg-muted/20'>
        <Container>
          <div className='grid items-start gap-10 lg:grid-cols-2'>
            <div>
              <Eyebrow>Security</Eyebrow>
              <h2 className='mt-4 text-3xl font-bold tracking-tight text-balance'>
                Safe to ship in a browser bundle
              </h2>
              <p className='text-muted-foreground mt-5 text-lg text-pretty'>
                Security here does not depend on hiding the publishable key.
                Placing a call requires a signed key, an exact allowed origin,
                an agent verified by email code, current workspace membership,
                and a server-side pass on permissions, caller ID, credit, and
                DNC.
              </p>
              <CheckList className='mt-6' items={SECURITY_POINTS} />
              <div className='mt-8'>
                <ButtonLink href='/security' variant='secondary' withArrow>
                  How Ringee handles security
                </ButtonLink>
              </div>
            </div>
            <div className='flex flex-col gap-5'>
              <Card>
                <div className='flex items-center gap-3'>
                  <span className='flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                    <KeyRound className='h-5 w-5' />
                  </span>
                  <h3 className='font-semibold'>Two keys, two jobs</h3>
                </div>
                <dl className='mt-4 flex flex-col gap-3 text-sm'>
                  <div className='border-border/60 flex flex-col gap-1 rounded-xl border p-3'>
                    <dt className='font-mono text-emerald-600 dark:text-emerald-400'>
                      pk_live_…
                    </dt>
                    <dd className='text-muted-foreground'>
                      Dialer SDK. Belongs in your frontend, scoped to the
                      origins you allow.
                    </dd>
                  </div>
                  <div className='border-border/60 flex flex-col gap-1 rounded-xl border p-3'>
                    <dt className='font-mono'>cik_live_…</dt>
                    <dd className='text-muted-foreground'>
                      Private Custom Integrations API. Server-side only — never
                      in browser code.
                    </dd>
                  </div>
                </dl>
              </Card>
              <Card>
                <div className='flex items-center gap-3'>
                  <span className='flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
                    <ShieldCheck className='h-5 w-5' />
                  </span>
                  <h3 className='font-semibold'>Content Security Policy</h3>
                </div>
                <p className='text-muted-foreground mt-3 text-sm text-pretty'>
                  A restrictive CSP needs to allow the Ringee API and the
                  calling WebSocket. Drop{' '}
                  <code className='font-mono'>unpkg</code> when you install from
                  npm.
                </p>
                <div className='mt-4'>
                  <CodeBlock code={CSP_SNIPPET} label='CSP' />
                </div>
              </Card>
            </div>
          </div>
        </Container>
      </Section>

      <Section id='get-a-key'>
        <Container>
          <SectionHeading
            eyebrow='Getting started'
            title='Get a publishable key'
            description='Publishable keys live inside a Custom Integration in your Ringee dashboard. Organization admins and admin-level personal accounts can create one.'
            align='left'
          />
          <div className='mt-10 grid gap-5 md:grid-cols-3'>
            {[
              {
                step: '01',
                title: 'Create a Custom Integration',
                body: 'In Ringee, open Integrations → Custom Integrations and create one for your app.'
              },
              {
                step: '02',
                title: 'Add your origins',
                body: 'Under Dialer SDK · Publishable keys, list every origin that will load the SDK — production, staging, and localhost. Origins match exactly.'
              },
              {
                step: '03',
                title: 'Generate and embed',
                body: 'Generate the pk_live_… key, pass it as the SDK key option, and place your first call.'
              }
            ].map((item) => (
              <Card key={item.step} className='flex h-full flex-col'>
                <span className='font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400'>
                  {item.step}
                </span>
                <h3 className='mt-3 font-semibold'>{item.title}</h3>
                <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                  {item.body}
                </p>
              </Card>
            ))}
          </div>

          <Card className='mt-8'>
            <div className='flex items-center gap-3'>
              <Code2 className='h-5 w-5 text-emerald-600 dark:text-emerald-400' />
              <h3 className='font-semibold'>
                Straight talk about this release
              </h3>
            </div>
            <p className='text-muted-foreground mt-3 text-sm text-pretty'>
              The SDK is young, so here is what it does not do yet — better to
              read it now than to find out mid-integration.
            </p>
            <ul className='mt-4 flex flex-col gap-2'>
              {NOT_INCLUDED.map((item) => (
                <li
                  key={item}
                  className='text-muted-foreground flex gap-2 text-sm'
                >
                  <span
                    className='bg-muted-foreground/50 mt-2 h-1 w-1 shrink-0 rounded-full'
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
            <p className='text-muted-foreground mt-4 text-sm text-pretty'>
              You can still run the SDK inside an iframe your application
              creates, as long as that document is an allowed origin and has
              microphone and storage access.
            </p>
          </Card>
        </Container>
      </Section>

      <FaqSection
        faqs={SDK_FAQS}
        description='Keys, frameworks, security, and what happens to a call once it leaves your app.'
      />

      <JsonLd
        data={softwareSourceCodeJsonLd({
          id: `${SITE_URL}/dialer-sdk#dialer-sdk`,
          name: '@ringee/dialer-sdk',
          description:
            'Universal browser SDK that embeds Ringee outbound calling into any web application, with floating, inline bar, and headless integration modes.',
          url: SDK_NPM_URL,
          codeRepository: GITHUB_URL
        })}
      />
    </DetailLayout>
  );
}
