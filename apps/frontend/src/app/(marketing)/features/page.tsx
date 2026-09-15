import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Bot } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import {
  Card,
  Container,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import { Breadcrumbs } from '@/features/marketing/components/breadcrumbs';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { FaqSection } from '@/features/marketing/components/faq';
import {
  FEATURE_CATEGORIES,
  featuresByCategory
} from '@/features/marketing/content/features';

export const metadata: Metadata = buildMetadata({
  title: 'Features — Human Calling, AI Voice Agents & Automation | Ringee',
  description:
    'Explore Ringee features for human and AI calling: voice agents, dialers, campaigns, recording, transcription, outcomes, CRM sync, and automation — without per-user pricing.',
  path: '/features'
});

const FEATURES_FAQS = [
  {
    question: 'What can you do with Ringee?',
    answer:
      'Ringee covers the full outbound loop: call leads worldwide from your browser or iOS, run shared calling campaigns, log call outcomes and notes, schedule callbacks and meetings to Google Calendar, record and transcribe calls in real time, sync activity to your CRM, and automate the busywork from Claude, ChatGPT, MCP agents, and the CLI.'
  },
  {
    question: 'Does Ringee record and transcribe calls?',
    answer:
      'Yes. Ringee records calls and transcribes them in real time. Transcription works with or without recording, so you can capture a searchable transcript even when you choose not to store the audio.'
  },
  {
    question: 'Can I automate Ringee with AI?',
    answer:
      'Yes. Claude, ChatGPT, any MCP-compatible agent, or the CLI can prospect, build human calling sessions, trigger configured AI voice agents that place and hold calls, read their results, log outcomes, and book follow-ups.'
  },
  {
    question: 'Which tools does Ringee integrate with?',
    answer:
      'Ringee connects to lead sources (Apollo, Prospeo), CRMs (Attio, Odoo), Google Calendar for meetings, and AI tools (ChatGPT, Claude, MCP-compatible agents, and the CLI).'
  },
  {
    question: 'Is Ringee open source?',
    answer:
      'Yes. Ringee is open source under the MIT license and can be self-hosted on your own infrastructure, so you keep full control of your data.'
  }
];

export default function FeaturesPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: 'Home', href: '/' },
          { name: 'Features', href: '/features' }
        ]}
      />
      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl'>
          <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            Everything you need for human and AI calling
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            Ringee groups its capabilities into five categories: communicate
            with leads, learn from every call, let AI orchestrate or hold the
            conversation, sync your data, and stay in control.
          </p>
        </Container>
      </Section>

      {FEATURE_CATEGORIES.map((category) => {
        const items = featuresByCategory(category.name);
        if (!items.length) return null;
        return (
          <Section key={category.name} className='py-10'>
            <Container>
              <div className='flex items-center gap-3'>
                <category.icon className='text-primary h-6 w-6' />
                <SectionHeading title={category.name} align='left' as='h2' />
              </div>
              <p className='text-muted-foreground mt-2'>{category.blurb}</p>
              <div className='mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
                {category.name === 'Automate' ? (
                  <Link href='/ai-voice-agents'>
                    <Card className='flex h-full flex-col border-violet-500/25 bg-violet-500/5 transition-colors hover:border-violet-500/50'>
                      <div className='flex items-center justify-between gap-2'>
                        <Bot className='h-6 w-6 text-violet-700 dark:text-violet-300' />
                        <ArrowRight className='text-muted-foreground h-4 w-4' />
                      </div>
                      <h3 className='mt-4 text-lg font-semibold'>
                        AI Voice Agents
                      </h3>
                      <p className='text-muted-foreground mt-2 text-sm'>
                        Build agents that place outbound calls, hold live
                        conversations, use tools, and return structured results.
                      </p>
                    </Card>
                  </Link>
                ) : null}
                {items.map((feature) => (
                  <Link key={feature.slug} href={`/features/${feature.slug}`}>
                    <Card className='hover:border-foreground/30 flex h-full flex-col transition-colors'>
                      <div className='flex items-center justify-between gap-2'>
                        <feature.icon className='text-primary h-6 w-6' />
                        <ArrowRight className='text-muted-foreground h-4 w-4' />
                      </div>
                      <h3 className='mt-4 text-lg font-semibold'>
                        {feature.name}
                      </h3>
                      <p className='text-muted-foreground mt-2 text-sm'>
                        {feature.tagline}
                      </p>
                    </Card>
                  </Link>
                ))}
              </div>
            </Container>
          </Section>
        );
      })}

      <FaqSection faqs={FEATURES_FAQS} />
      <CtaSection />
    </>
  );
}
