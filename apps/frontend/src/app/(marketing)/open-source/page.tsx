import Link from 'next/link';
import type { Metadata } from 'next';
import { Bot, Github, ServerCog, Terminal, Workflow } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import {
  Card,
  Container,
  CtaButtons,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import { Breadcrumbs } from '@/features/marketing/components/breadcrumbs';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { FaqSection } from '@/features/marketing/components/faq';
import { GITHUB_URL } from '@/features/marketing/site';

export const metadata: Metadata = buildMetadata({
  title: 'Open Source Outbound Calling | Ringee',
  description:
    'Ringee is open source and developer-friendly. Automate outbound with MCP-compatible agents and CLI workflows, inspect the code, and self-host. View the project on GitHub.',
  path: '/open-source'
});

const PILLARS = [
  {
    icon: Workflow,
    title: 'MCP-compatible agents',
    body: 'Ringee ships an MCP server so any MCP-compatible agent — including ChatGPT and Claude — can drive outbound: prospecting, contacts, calls, outcomes, and follow-ups.'
  },
  {
    icon: Terminal,
    title: 'CLI workflows',
    body: 'Script your outbound from the command line and your own tooling for repeatable, version-controllable automation.'
  },
  {
    icon: Bot,
    title: 'Developer automation',
    body: 'Built to be automated, not just clicked. Wire Ringee into the tools and pipelines you already run.'
  },
  {
    icon: ServerCog,
    title: 'Self-hostable',
    body: 'Run Ringee on your own infrastructure for full control of your data, storage, and connections.'
  }
];

const OPEN_SOURCE_FAQS = [
  {
    question: 'Is Ringee really open source?',
    answer:
      'Yes. Ringee’s source is open and available on GitHub, so you can inspect how it works, contribute, and run it yourself.'
  },
  {
    question: 'Where can I find the code?',
    answer:
      'The project is hosted on GitHub. Use the GitHub link on this page to view the repository.'
  },
  {
    question: 'Can I automate Ringee without writing code?',
    answer:
      'Yes. Non-developers can drive outbound through ChatGPT or Claude over the MCP server. Developers can additionally script workflows from the CLI.'
  },
  {
    question: 'Do I have to self-host to use Ringee?',
    answer:
      'No. You can use the hosted cloud version, or self-host for full control. Both run the same open codebase.'
  }
];

export default function OpenSourcePage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: 'Home', href: '/' },
          { name: 'Open Source', href: '/open-source' }
        ]}
      />
      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl'>
          <div className='border-border/70 bg-muted/40 text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium'>
            <Github className='h-3.5 w-3.5' /> Open source
          </div>
          <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            Open source, developer-friendly outbound calling
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            Ringee is open source and built to be automated. Inspect the code,
            extend it, automate it with MCP-compatible agents and CLI workflows,
            and run it yourself if you want full control.
          </p>
          <div className='mt-8 flex flex-col gap-3 sm:flex-row'>
            <CtaButtons
              primaryHref={GITHUB_URL}
              primaryLabel='View on GitHub'
              secondaryHref='/self-hosted'
              secondaryLabel='Self-hosting guide'
            />
          </div>
        </Container>
      </Section>

      <Section className='pt-4'>
        <Container>
          <SectionHeading
            title='A developer-first foundation'
            description='Ringee is designed for teams that want their calling stack to be programmable.'
          />
          <div className='mt-12 grid gap-5 sm:grid-cols-2'>
            {PILLARS.map((pillar) => (
              <Card key={pillar.title}>
                <pillar.icon className='text-primary h-7 w-7' />
                <h2 className='mt-4 text-xl font-semibold'>{pillar.title}</h2>
                <p className='text-muted-foreground mt-2 text-sm'>
                  {pillar.body}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section className='bg-muted/20'>
        <Container>
          <Card className='flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between'>
            <div className='flex items-start gap-4'>
              <Github className='text-primary mt-1 h-8 w-8 shrink-0' />
              <div>
                <h2 className='text-xl font-semibold'>Explore the project</h2>
                <p className='text-muted-foreground mt-2 max-w-2xl text-sm'>
                  See how Ringee is built, open issues, and follow development on
                  GitHub.
                </p>
              </div>
            </div>
            <Link
              href={GITHUB_URL}
              target='_blank'
              rel='noreferrer noopener'
              className='inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-6 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900'
            >
              <Github className='h-4 w-4' /> Open GitHub
            </Link>
          </Card>
        </Container>
      </Section>

      <FaqSection faqs={OPEN_SOURCE_FAQS} />
      <CtaSection />
    </>
  );
}
