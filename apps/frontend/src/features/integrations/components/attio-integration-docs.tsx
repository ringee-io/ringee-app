'use client';

import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ringee/frontend-shared/components/ui/accordion';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Lock,
  MonitorSmartphone,
  Phone,
  RefreshCw,
  Settings,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export function AttioIntegrationDocs() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main>
        <HeroSection />
        <WhatItDoes />
        <FeaturesGrid />
        <HowItWorks />
        <InsideAttio />
        <Configuration />
        <UseCases />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/android-chrome-192x192.png"
              alt="Ringee"
              width={28}
              height={28}
              className="rounded-md"
            />
            <span className="text-sm font-bold">Ringee</span>
          </Link>
          <div className="hidden items-center gap-1 text-sm text-muted-foreground sm:flex">
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="hover:text-foreground">Integrations</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium">Attio</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/auth/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/auth/sign-up">
            <Button size="sm">Get Started</Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b">
      <div className="absolute inset-0 bg-gradient-to-b from-violet-500/5 via-transparent to-transparent" />
      <div className="relative mx-auto max-w-screen-xl px-6 pb-20 pt-20 md:pb-28 md:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 flex items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border bg-background p-2 shadow-sm">
              <Image
                src="/android-chrome-192x192.png"
                alt="Ringee"
                width={32}
                height={32}
                className="rounded-md"
              />
            </div>
            <div className="flex h-6 w-6 items-center justify-center">
              <Zap className="h-4 w-4 text-violet-500" />
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border bg-background p-2 shadow-sm">
              <Image
                src="/companies/attio.svg"
                alt="Attio"
                width={32}
                height={32}
                className="dark:invert"
              />
            </div>
          </div>

          <Badge
            variant="outline"
            className="mb-6 border-violet-500/30 bg-violet-500/10 text-violet-500"
          >
            <Sparkles className="mr-1.5 h-3 w-3" /> Integration
          </Badge>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Start calls from Attio.
            <br />
            <span className="text-muted-foreground">
              Keep everything in sync.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Launch Ringee directly from any person or company record in Attio.
            Call context flows in, call activity flows back. No tab-switching, no
            copy-pasting numbers.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/auth/sign-up">
              <Button size="lg" className="gap-2">
                Connect Ringee + Attio
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="#how-it-works">
              <Button variant="outline" size="lg">
                See how it works
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function WhatItDoes() {
  const points = [
    'Start calls from Person and Company records in Attio',
    'Pre-call dialog with number selection and context',
    'Open the Ringee dialer with a secure session handoff',
    'View related call info inside Attio via the Record Widget',
    'Sync call activity, duration, recordings, and notes back to the CRM',
  ];

  return (
    <section className="border-b py-20 md:py-28">
      <div className="mx-auto max-w-screen-xl px-6">
        <div className="mx-auto max-w-3xl">
          <Badge variant="outline" className="mb-4">
            Overview
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            What the integration does
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            The Ringee integration for Attio connects your CRM to your calling
            workflow. Every call starts with context and ends with a synced
            record.
          </p>

          <div className="mt-10 space-y-4">
            {points.map((point) => (
              <div
                key={point}
                className="flex items-start gap-3 rounded-lg border bg-card p-4"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <p className="text-sm leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesGrid() {
  const features = [
    {
      icon: Phone,
      title: 'Call with Ringee from Attio records',
      description:
        'A Record Action on person and company records lets you launch a call in one click. The integration passes the right phone number and record context to Ringee.',
    },
    {
      icon: MonitorSmartphone,
      title: 'Pre-call flow with context',
      description:
        'Before the call starts, a dialog shows you the number to dial, the record name, and any relevant context. Review, confirm, and open the Ringee dialer.',
    },
    {
      icon: Zap,
      title: 'Record Widget inside Attio',
      description:
        'A widget embedded in Attio records shows call history, recent activity, and quick actions. You see everything without leaving your CRM workspace.',
    },
    {
      icon: Settings,
      title: 'Workspace Settings',
      description:
        'Configure your Ringee connection, API URL, and authentication at the workspace level. Admins manage the integration from Attio settings.',
    },
    {
      icon: Lock,
      title: 'Secure session handoff',
      description:
        'When you click "Call with Ringee," the integration creates a short-lived, scoped session token. The Ringee dialer opens with context, no credentials are exposed.',
    },
    {
      icon: RefreshCw,
      title: 'Call activity synced back into Attio',
      description:
        'After the call ends, Ringee pushes the activity to the matching Attio record: duration, outcome, recording link, and notes. Your CRM stays current.',
    },
  ];

  return (
    <section className="border-b bg-muted/30 py-20 md:py-28">
      <div className="mx-auto max-w-screen-xl px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">
            Features
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to call from your CRM
          </h2>
          <p className="mt-4 text-muted-foreground">
            The integration covers the full cycle: from initiating the call to
            logging the outcome.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex flex-col rounded-xl border bg-card p-6 transition-colors hover:border-foreground/20"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
                <feature.icon className="h-5 w-5 text-violet-500" />
              </div>
              <h3 className="text-sm font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      step: '01',
      title: 'Install the Ringee app in Attio',
      description:
        'Go to Attio Settings > Integrations and install the Ringee app. This enables the Record Action, Dialog, and Widget on your workspace.',
    },
    {
      step: '02',
      title: 'Configure your Ringee connection',
      description:
        'In Workspace Settings, enter your Ringee API URL and integration token. The app validates the connection before saving.',
    },
    {
      step: '03',
      title: 'Open a person or company record',
      description:
        'Navigate to any record in Attio that has a phone number. The Ringee Record Action appears in the actions bar.',
    },
    {
      step: '04',
      title: 'Click "Call with Ringee"',
      description:
        'The Record Action opens a dialog showing the phone number, record name, and call context. Review the details before proceeding.',
    },
    {
      step: '05',
      title: 'Launch the Ringee dialer',
      description:
        'Click "Start Call" to open Ringee in a new tab. A secure session token passes the context so the dialer is pre-loaded with the right number.',
    },
    {
      step: '06',
      title: 'Complete the call',
      description:
        'Use the Ringee dialer to make the call. Record, take notes, and set a disposition as you normally would.',
    },
    {
      step: '07',
      title: 'See synced activity in Attio',
      description:
        'After the call, Ringee pushes a structured activity to the matching record in Attio: call duration, outcome, recording link, and any notes you added.',
    },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-14 border-b py-20 md:py-28">
      <div className="mx-auto max-w-screen-xl px-6">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">
            How it works
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            From install to first synced call in minutes
          </h2>
        </div>

        <div className="mx-auto max-w-2xl">
          {steps.map((item, i) => (
            <div key={item.step} className="relative flex gap-6 pb-10">
              {i < steps.length - 1 && (
                <div className="absolute left-5 top-12 h-[calc(100%-48px)] w-px bg-border" />
              )}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-card text-xs font-bold">
                {item.step}
              </div>
              <div className="flex-1 pt-1.5">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
                <ScreenshotPlaceholder label={item.title} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function InsideAttio() {
  const surfaces = [
    {
      title: 'Record Action',
      description:
        'Appears in the actions bar on person and company records. One click opens the pre-call dialog.',
    },
    {
      title: 'Call Dialog',
      description:
        'Shows the phone number, record context, and a "Start Call" button. Opens Ringee with a secure session.',
    },
    {
      title: 'Record Widget',
      description:
        'An embedded panel on the record page showing call history, recent activity, and quick actions.',
    },
    {
      title: 'Synced Notes & Activity',
      description:
        'Structured activity entries on the record timeline: duration, outcome, recording link, and call notes.',
    },
    {
      title: 'Recordings & Summaries',
      description:
        'When available, call recordings and AI-generated summaries are linked directly in the synced activity.',
    },
  ];

  return (
    <section className="border-b bg-muted/30 py-20 md:py-28">
      <div className="mx-auto max-w-screen-xl px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">
            Inside Attio
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            What you see in your CRM
          </h2>
          <p className="mt-4 text-muted-foreground">
            The integration adds calling capabilities directly inside your Attio
            workspace.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-2">
          {surfaces.map((surface) => (
            <div
              key={surface.title}
              className="flex flex-col rounded-xl border bg-card overflow-hidden"
            >
              <div className="flex aspect-[16/9] items-center justify-center border-b bg-muted/50">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-8 w-8 opacity-30" />
                  <span className="text-xs">Screenshot: {surface.title}</span>
                </div>
              </div>
              <div className="p-5">
                <h3 className="text-sm font-semibold">{surface.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {surface.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Configuration() {
  const requirements = [
    {
      title: 'Ringee account',
      description:
        'Sign up at ringee.io and add calling credit. Any plan works.',
    },
    {
      title: 'Ringee app installed in Attio',
      description:
        'Install from Attio Settings > Integrations. The app registers the Record Action, Dialog, Widget, and Workspace Settings.',
    },
    {
      title: 'Integration token',
      description:
        'Generate a token in Ringee under Settings > Integrations > Attio. This authorizes the Attio app to create call sessions.',
    },
    {
      title: 'Ringee API URL',
      description:
        'If you self-host Ringee, enter your API base URL. Cloud users can leave the default.',
    },
    {
      title: 'Workspace Settings configured',
      description:
        'Open Workspace Settings in the Attio app to enter and validate your token and API URL.',
    },
  ];

  return (
    <section className="border-b py-20 md:py-28">
      <div className="mx-auto max-w-screen-xl px-6">
        <div className="mx-auto max-w-3xl">
          <Badge variant="outline" className="mb-4">
            Configuration
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            What you need to get started
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Setup takes under five minutes. Here is what you need.
          </p>

          <div className="mt-10 space-y-3">
            {requirements.map((req, i) => (
              <div
                key={req.title}
                className="flex items-start gap-4 rounded-lg border bg-card p-4"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold">
                  {i + 1}
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{req.title}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {req.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function UseCases() {
  const cases = [
    {
      title: 'Sales teams',
      description:
        'Call prospects directly from their Attio record. Every touchpoint is logged automatically — no manual data entry after calls.',
    },
    {
      title: 'SDRs & BDRs',
      description:
        'Power through outbound sequences without leaving the CRM. Context loads before each call, activity syncs after.',
    },
    {
      title: 'Founders & solo operators',
      description:
        'Keep investor, customer, and partner calls organized in Attio. One workflow, no extra tools to juggle.',
    },
    {
      title: 'Recruiters',
      description:
        'Call candidates from their record and log every screening call with duration, notes, and outcome.',
    },
    {
      title: 'Operations teams',
      description:
        'Coordinate with vendors, partners, and suppliers. Call history lives on the company record for the whole team to see.',
    },
  ];

  return (
    <section className="border-b bg-muted/30 py-20 md:py-28">
      <div className="mx-auto max-w-screen-xl px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">
            Use cases
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Built for teams that live in their CRM
          </h2>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => (
            <div
              key={c.title}
              className="rounded-xl border bg-card p-5 transition-colors hover:border-foreground/20"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
                <Users className="h-4 w-4 text-violet-500" />
              </div>
              <h3 className="text-sm font-semibold">{c.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {c.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const faqs = [
    {
      question: 'Does Ringee replace Attio calling?',
      answer:
        'No. Ringee is a standalone VoIP platform. The integration adds a Record Action in Attio that opens the Ringee dialer. It does not replace or override any native Attio calling features.',
    },
    {
      question: 'Where does the call happen?',
      answer:
        'The call happens in the Ringee web dialer. When you click "Call with Ringee" in Attio, a new browser tab opens with the Ringee dialer pre-loaded with the right number and context.',
    },
    {
      question: 'What gets synced back to Attio?',
      answer:
        'Call duration, outcome/disposition, a link to the recording (when enabled), and any notes you added during or after the call. These appear as structured activities on the matching record.',
    },
    {
      question: 'Does the integration support workspace-level setup?',
      answer:
        'Yes. Workspace admins configure the connection once in Attio Workspace Settings. All members of the workspace can then use the Record Action to call with Ringee.',
    },
    {
      question: 'Can users with multiple organizations use it?',
      answer:
        'Yes. In Ringee, you can connect Attio at the personal level or at the organization level. Org-level connections share the integration across the whole team.',
    },
    {
      question: 'Does Ringee store recordings and call context?',
      answer:
        'Yes. Ringee stores encrypted recordings and call metadata on your account. The synced activity in Attio includes a direct link to the recording in Ringee. Access is scoped to your account or organization.',
    },
    {
      question: 'Is the session handoff secure?',
      answer:
        'Yes. When you launch a call from Attio, the integration creates a short-lived, scoped token. It only authorizes one call session and expires after use. No long-lived credentials are shared.',
    },
    {
      question: 'What Attio record types are supported?',
      answer:
        'The integration works with person and company records. Any record that has a phone number field can trigger the "Call with Ringee" action.',
    },
  ];

  return (
    <section id="faq" className="scroll-mt-14 border-b py-20 md:py-28">
      <div className="mx-auto max-w-screen-xl px-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-4">
              FAQ
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Frequently asked questions
            </h2>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm font-medium">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-screen-xl px-6">
        <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-10 text-center md:p-16">
          <div className="mb-6 flex items-center justify-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background p-1.5 shadow-sm">
              <Image
                src="/android-chrome-192x192.png"
                alt="Ringee"
                width={28}
                height={28}
                className="rounded-md"
              />
            </div>
            <span className="text-lg text-muted-foreground">+</span>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background p-2 shadow-sm">
              <Image
                src="/companies/attio.svg"
                alt="Attio"
                width={24}
                height={24}
                className="dark:invert"
              />
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to call from your CRM?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Connect Ringee to Attio and make your first call in under five
            minutes. No contracts, no per-seat fees.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/auth/sign-up">
              <Button size="lg" className="gap-2">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="https://cal.com/ringee" target="_blank">
              <Button variant="outline" size="lg" className="gap-2">
                Book a Demo
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t py-8">
      <div className="mx-auto flex max-w-screen-xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Image
            src="/android-chrome-192x192.png"
            alt="Ringee"
            width={20}
            height={20}
            className="rounded-sm"
          />
          <span>
            &copy; {new Date().getFullYear()} Ringee. All rights reserved.
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
        </div>
      </div>
    </footer>
  );
}

function ScreenshotPlaceholder({ label }: { label: string }) {
  return (
    <div className="mt-4 flex aspect-[16/9] items-center justify-center rounded-lg border bg-muted/50">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <ImageIcon className="h-6 w-6 opacity-30" />
        <span className="text-[11px]">Screenshot: {label}</span>
      </div>
    </div>
  );
}
