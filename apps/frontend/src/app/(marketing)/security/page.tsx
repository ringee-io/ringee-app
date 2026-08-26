import type { Metadata } from 'next';
import {
  Bot,
  Database,
  KeyRound,
  type LucideIcon,
  Mic,
  ServerCog,
  ShieldCheck,
  Users
} from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import {
  Card,
  Container,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { FaqSection } from '@/features/marketing/components/faq';

export const metadata: Metadata = buildMetadata({
  title: 'Security & Trust | Ringee',
  description:
    'How Ringee protects your data: account security, configurable call recording, workspace access, infrastructure, the self-hosted option, and responsible AI usage.',
  path: '/security'
});

type SecuritySection = {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string[];
};

const SECTIONS: SecuritySection[] = [
  {
    id: 'data-protection',
    icon: Database,
    title: 'Data protection',
    body: [
      'Your contacts, calls, recordings, and notes live in your Ringee workspace and are scoped to your organization. Traffic between your browser and Ringee is served over HTTPS.',
      'Ringee has not completed formal certifications such as SOC 2 or ISO 27001, and we do not claim them. If your organization requires full control over where data lives, Ringee is open source and can be self-hosted on your own infrastructure.'
    ]
  },
  {
    id: 'account-security',
    icon: KeyRound,
    title: 'Account & team access',
    body: [
      'Authentication is handled by Clerk, a dedicated identity provider, so sign-in and session management follow established practices rather than something we built from scratch.',
      'Access is organized around organizations and memberships. People see the workspace they belong to, and you control who is part of your organization.'
    ]
  },
  {
    id: 'recording-controls',
    icon: Mic,
    title: 'Recording controls',
    body: [
      'Call recording is configurable at the organization or user level, so you record only what you intend to. Recordings are attached to the relevant call and contact.',
      'Recording and consent laws vary by country and region. Ringee gives you the controls; you are responsible for meeting the notification and consent requirements that apply to your calls.'
    ]
  },
  {
    id: 'workspace-access',
    icon: Users,
    title: 'Workspace management',
    body: [
      'Ringee is multi-tenant: each organization is an isolated workspace with its own contacts, campaigns, numbers, and credits. Users with access to more than one workspace can switch between them.',
      'Calling credits and recording settings are managed per workspace, so personal and organization usage stay separate.'
    ]
  },
  {
    id: 'infrastructure',
    icon: ServerCog,
    title: 'Infrastructure',
    body: [
      'Calls are connected through Telnyx, a carrier-grade telephony provider. Payments are processed by Stripe, so card details are handled by a dedicated payments provider rather than stored by Ringee.',
      'Ringee runs on standard cloud infrastructure. When you self-host, you choose where everything runs.'
    ]
  },
  {
    id: 'responsible-ai',
    icon: Bot,
    title: 'Responsible AI usage',
    body: [
      'Ringee’s AI automation prepares work and sends calls to your devices — it does not place calls on its own. A person always takes the conversation.',
      'Sensitive actions, such as spending credits or revoking dialer links, require confirmation, and destructive actions like deleting a contact are double-guarded. You decide what agents are allowed to do in your workspace.'
    ]
  }
];

const SECURITY_FAQS = [
  {
    question: 'Is Ringee SOC 2 or ISO certified?',
    answer:
      'No. Ringee has not completed SOC 2, ISO 27001, or similar certifications, and we do not claim them. Teams that need full control can self-host, since Ringee is open source.'
  },
  {
    question: 'Who can access my data?',
    answer:
      'Data is scoped to your organization and visible to the members of that workspace. Authentication and access are managed through Clerk.'
  },
  {
    question: 'Are my calls recorded automatically?',
    answer:
      'Only if you configure recording. Recording is controlled at the organization or user level, and you are responsible for following the consent rules that apply to your calls.'
  },
  {
    question: 'Can I keep everything on my own servers?',
    answer:
      'Yes. Ringee is open source and self-hostable, so you can run it on your own infrastructure and keep your data where you want it.'
  }
];

export default function SecurityPage() {
  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'Security', href: '/security' }
      ]}
      cta={<CtaSection />}
    >
      <Section className='pt-8 pb-4'>
        <Container className='max-w-3xl'>
          <div className='border-border/70 bg-muted/40 text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium'>
            <ShieldCheck className='h-3.5 w-3.5' /> Security &amp; trust
          </div>
          <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
            Security and controls you can verify
          </h1>
          <p className='text-muted-foreground mt-6 text-lg text-pretty'>
            We keep this page factual. Below is how Ringee handles your data,
            recordings, access, and AI automation today — including the things
            we don’t claim. For full control, Ringee is open source and
            self-hostable.
          </p>
        </Container>
      </Section>

      <Section className='pt-4'>
        <Container>
          <div className='grid gap-5 md:grid-cols-2'>
            {SECTIONS.map((section) => (
              <Card key={section.id} id={section.id} className='scroll-mt-24'>
                <section.icon className='text-primary h-7 w-7' />
                <h2 className='mt-4 text-xl font-semibold'>{section.title}</h2>
                <div className='mt-3 flex flex-col gap-3'>
                  {section.body.map((paragraph) => (
                    <p
                      key={paragraph.slice(0, 24)}
                      className='text-muted-foreground text-sm'
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section id='self-hosted' className='bg-muted/20 scroll-mt-24'>
        <Container>
          <SectionHeading
            title='Need full control? Self-host Ringee'
            description='Run Ringee on your own infrastructure for complete ownership of your data, storage, and connections.'
            align='left'
          />
          <div className='mt-6'>
            <a
              href='/self-hosted'
              className='text-primary text-sm font-semibold'
            >
              Learn about self-hosting →
            </a>
          </div>
        </Container>
      </Section>

      <FaqSection faqs={SECURITY_FAQS} />
    </DetailLayout>
  );
}
