import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  AudioLines,
  BellRing,
  Bot,
  BrainCircuit,
  CalendarCheck,
  Check,
  FileSearch,
  KeyRound,
  ListChecks,
  MessageSquareText,
  PhoneOutgoing,
  ShieldCheck,
  UserRoundCheck,
  Workflow
} from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import { CtaSection } from '@/features/marketing/components/cta-section';
import { DetailLayout } from '@/features/marketing/components/detail-layout';
import { FaqSection, type Faq } from '@/features/marketing/components/faq';
import { OperatorPortrait } from '@/features/marketing/components/operator-portrait';
import { TeamPlanNote } from '@/features/marketing/components/team-plan-note';
import { JsonLd } from '@/features/marketing/components/json-ld';
import {
  Card,
  Container,
  CtaButtons,
  Section,
  SectionHeading
} from '@/features/marketing/components/primitives';
import { SITE_URL } from '@/features/marketing/site';

const PAGE_TITLE = 'AI Voice Agents That Make Real Calls | Ringee';
const PAGE_DESCRIPTION =
  'Build AI voice agents that place outbound calls, hold live conversations, book meetings, deliver reminders, and return recordings, transcripts, outcomes, and structured results.';

export const metadata: Metadata = buildMetadata({
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  path: '/ai-voice-agents'
});

const CAPABILITIES = [
  {
    title: 'Place real outbound calls',
    description:
      'Start an agent call from Ringee, the API, MCP, or the CLI. The voice agent originates the call and takes the live conversation.',
    icon: PhoneOutgoing
  },
  {
    title: 'Talk from your context',
    description:
      'Give every agent a name, voice, company profile, editable instructions, per-call variables, and a natural opening turn.',
    icon: MessageSquareText
  },
  {
    title: 'Use real knowledge',
    description:
      'Add web pages, documents, and text sources. Once indexed, the agent can retrieve them while it speaks.',
    icon: FileSearch
  },
  {
    title: 'Act during the conversation',
    description:
      'Check real availability, book an agreed meeting, schedule a callback, or request human follow-up without leaving the call.',
    icon: CalendarCheck
  },
  {
    title: 'Return structured results',
    description:
      'Get the outcome, summary, optional sentiment, and custom fields such as team size or interest after the call ends.',
    icon: ListChecks
  },
  {
    title: 'Keep the complete record',
    description:
      'Agent calls return to the same Ringee history with their recording and transcript, ready for review and integrations.',
    icon: AudioLines
  }
];

const SETUP_STEPS = [
  {
    title: 'Choose the job',
    description:
      'Start from an appointment-booking or reminders-and-notifications blueprint with tested tools and safeguards.'
  },
  {
    title: 'Make it yours',
    description:
      'Set the voice, model, company context, knowledge, greeting, instructions, result fields, and calling number.'
  },
  {
    title: 'Test in the browser',
    description:
      'Speak to the agent through your microphone before it calls a real person. Browser tests use no phone call or calling credit.'
  },
  {
    title: 'Call and use the result',
    description:
      'Trigger a real call, then read its recording, transcript, summary, outcome, and extracted data in Ringee or through your tools.'
  }
];

const CONTROLS = [
  {
    title: 'Real calendar truth',
    description:
      'Booking agents must look up current availability before offering a time and can confirm only a slot the person accepts.',
    icon: CalendarCheck
  },
  {
    title: 'Human follow-up built in',
    description:
      'If someone asks for a person or a tool fails, the agent can notify workspace administrators with the call context.',
    icon: UserRoundCheck
  },
  {
    title: 'Workspace-scoped execution',
    description:
      'Numbers, credits, agents, calls, knowledge, and results stay inside the active organization workspace.',
    icon: ShieldCheck
  },
  {
    title: 'Model choice',
    description:
      'Use the Ringee-managed option or configure a supported model with your own verified API key.',
    icon: KeyRound
  }
];

const FAQS: Faq[] = [
  {
    question: 'Can AI voice agents actually make phone calls with Ringee?',
    answer:
      'Yes. A Ringee AI voice agent places a real outbound call and holds the live conversation itself. You can start the call from the Ringee dashboard, API, MCP tools, or CLI, then review the result after it ends.'
  },
  {
    question: 'What can a Ringee AI voice agent do during a call?',
    answer:
      'Depending on its blueprint, an agent can book an appointment against real calendar availability, deliver a reminder or notification, schedule a callback, retrieve knowledge, and request human follow-up. It can also end the call when the job is complete.'
  },
  {
    question: 'Is AI call automation the same as an AI voice agent?',
    answer:
      'They are two connected capabilities. AI call automation lets ChatGPT, Claude, MCP agents, and the CLI orchestrate Ringee workflows. An AI voice agent is the operator that places the phone call and speaks. Automation can prepare a human calling session or trigger a configured voice agent.'
  },
  {
    question: 'What happens after an AI voice agent call?',
    answer:
      'Ringee stores the call in your shared history and recovers its recording and transcript. It also returns a structured outcome, an optional summary and sentiment, and any custom fields you configured the agent to extract.'
  },
  {
    question: 'Can someone ask to speak with a human?',
    answer:
      'Yes. The agent can create a human-support request with the contact, call, agent, and a concise explanation so a workspace administrator can follow up. Ringee does not currently claim live call transfer on this page.'
  },
  {
    question: 'How are AI voice agent calls billed?',
    answer:
      'AI voice agents require an active organization workspace. A real call uses workspace credit and combines telephony with voice and model usage, so the final cost depends on the destination and the agent configuration. Browser test conversations do not place a phone call.'
  },
  {
    question: 'Can I use my own model API key?',
    answer:
      'Yes. You can use the Ringee-managed model option or select a supported provider and verify your own API key when configuring the agent.'
  }
];

function CheckItem({ children }: { children: string }) {
  return (
    <li className='flex items-start gap-3'>
      <Check className='mt-0.5 h-5 w-5 shrink-0 text-emerald-500' aria-hidden />
      <span className='text-sm text-emerald-50/80'>{children}</span>
    </li>
  );
}

export default async function AiVoiceAgentsPage() {
  const t = await getTranslations('marketing.aiVoiceLanding');
  return (
    <DetailLayout
      items={[
        { name: 'Home', href: '/' },
        { name: 'AI Voice Agents', href: '/ai-voice-agents' }
      ]}
      cta={
        <CtaSection
          title={t('ctaTitle')}
          description={t('ctaDescription')}
          ai
        />
      }
    >
      <Section className='pt-8 pb-12 sm:pt-10 sm:pb-16'>
        <Container>
          <div className='grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(160px,0.6fr)]'>
            <div>
              <div className='inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/8 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400'>
                <Bot className='h-3.5 w-3.5' aria-hidden />
                {t('eyebrow')}
              </div>
              <h1 className='mt-5 text-4xl leading-[1.08] font-semibold tracking-[-0.045em] text-balance xl:text-5xl'>
                {t('headline')}{' '}
                <span className='text-emerald-700 dark:text-emerald-400'>
                  {t('highlight')}
                </span>
              </h1>
              <p className='text-muted-foreground mt-5 text-base leading-relaxed text-pretty sm:text-lg'>
                {t('description')}
              </p>
            </div>
            <div className='mx-auto w-full max-w-[250px] md:max-w-none'>
              <OperatorPortrait operator='robot' label={t('eyebrow')} />
            </div>
          </div>
          <div className='mt-8 flex flex-col items-start'>
            <p className='text-sm font-medium text-emerald-700 dark:text-emerald-400'>
              {t('proof')}
            </p>
            <CtaButtons className='mt-5 w-full sm:w-auto' />
            <TeamPlanNote ai className='mt-4 text-left' />
          </div>
        </Container>
      </Section>

      <Section className='border-y border-emerald-500/15 bg-emerald-500/5 py-8 sm:py-10'>
        <Container>
          <p className='text-xl font-semibold tracking-tight text-balance sm:text-2xl'>
            {t('sharedTitle')}
          </p>
          <p className='text-muted-foreground mt-3 text-sm leading-relaxed'>
            {t('sharedDescription')}
          </p>
        </Container>
      </Section>

      <Section id='capabilities'>
        <Container>
          <SectionHeading
            eyebrow='From dial to result'
            title={t('sections.capabilities')}
            description='Configure the conversation once. Ringee gives the agent the calling, knowledge, tools, and result pipeline it needs to complete repeatable phone work.'
          />
          <div className='mt-12 grid gap-5 sm:grid-cols-2'>
            {CAPABILITIES.map((capability) => (
              <Card key={capability.title} className='h-full'>
                <span className='inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'>
                  <capability.icon className='h-5 w-5' aria-hidden />
                </span>
                <h3 className='mt-4 text-lg font-semibold'>
                  {capability.title}
                </h3>
                <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                  {capability.description}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section id='blueprints' className='bg-muted/20'>
        <Container>
          <SectionHeading
            eyebrow='Production blueprints'
            title={t('sections.blueprints')}
            description='Each blueprint includes editable language and immutable safeguards around the actions that must stay correct.'
            align='left'
          />
          <div className='mt-10 grid gap-5 lg:grid-cols-2'>
            <Card className='relative h-full overflow-hidden p-7'>
              <div
                aria-hidden
                className='absolute -top-16 -right-16 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl'
              />
              <CalendarCheck className='h-8 w-8 text-emerald-700 dark:text-emerald-300' />
              <p className='text-muted-foreground mt-6 text-xs font-semibold tracking-wide uppercase'>
                Appointment booking
              </p>
              <h3 className='mt-2 text-2xl font-semibold tracking-tight'>
                Turn a live conversation into a confirmed meeting
              </h3>
              <p className='text-muted-foreground mt-4 text-pretty'>
                The agent handles questions, checks the Ringee calendar in real
                time, offers only available times, confirms the choice, and
                books the meeting before it hangs up.
              </p>
            </Card>
            <Card className='relative h-full overflow-hidden p-7'>
              <div
                aria-hidden
                className='absolute -top-16 -right-16 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl'
              />
              <BellRing className='h-8 w-8 text-emerald-700 dark:text-emerald-300' />
              <p className='text-muted-foreground mt-6 text-xs font-semibold tracking-wide uppercase'>
                Reminders &amp; notifications
              </p>
              <h3 className='mt-2 text-2xl font-semibold tracking-tight'>
                Deliver the message and understand the response
              </h3>
              <p className='text-muted-foreground mt-4 text-pretty'>
                The agent confirms an appointment, reminder, or update, answers
                from the context you supplied, schedules a callback when asked,
                and records where the person stands.
              </p>
            </Card>
          </div>
        </Container>
      </Section>

      <Section id='how-it-works'>
        <Container>
          <SectionHeading
            eyebrow='Setup to live call'
            title={t('sections.setup')}
          />
          <ol className='mt-12 grid gap-5 sm:grid-cols-2'>
            {SETUP_STEPS.map((step, index) => (
              <li key={step.title}>
                <Card className='h-full'>
                  <span className='inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white dark:bg-emerald-500'>
                    {index + 1}
                  </span>
                  <h3 className='mt-4 text-lg font-semibold'>{step.title}</h3>
                  <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                    {step.description}
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <Section id='shared-stack' className='py-10 sm:py-16'>
        <Container>
          <div className='relative overflow-hidden rounded-3xl bg-zinc-950 px-6 py-10 text-white sm:px-10 sm:py-14'>
            <div
              aria-hidden
              className='pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_100%_0%,rgba(16,185,129,0.28),transparent_70%)]'
            />
            <div className='relative grid gap-10 xl:items-center'>
              <div>
                <p className='text-sm font-semibold tracking-wide text-emerald-300 uppercase'>
                  One infrastructure
                </p>
                <h2 className='mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl'>
                  {t('sections.sharedStack')}
                </h2>
                <p className='mt-5 max-w-2xl text-lg text-pretty text-zinc-300'>
                  Your reps and voice agents use the same Ringee foundation, so
                  AI calling is part of your operation instead of a disconnected
                  experiment.
                </p>
              </div>
              <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-1'>
                <CheckItem>
                  Ringee calling numbers and workspace credit
                </CheckItem>
                <CheckItem>One call history across human and AI work</CheckItem>
                <CheckItem>
                  Recordings, transcripts, outcomes, and notes
                </CheckItem>
                <CheckItem>
                  Calendar actions and Custom Integration events
                </CheckItem>
                <CheckItem>
                  Dashboard, API, CLI, and MCP trigger surfaces
                </CheckItem>
              </ul>
            </div>
          </div>
        </Container>
      </Section>

      <Section id='controls'>
        <Container>
          <SectionHeading
            eyebrow='Production controls'
            title={t('sections.controls')}
            description='Ringee keeps the operational rules in the platform while you control the agent’s role, context, voice, and desired result.'
            align='left'
          />
          <div className='mt-10 grid gap-5 sm:grid-cols-2'>
            {CONTROLS.map((control) => (
              <Card key={control.title} className='h-full'>
                <div className='flex items-start gap-4'>
                  <span className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'>
                    <control.icon className='h-5 w-5' aria-hidden />
                  </span>
                  <div>
                    <h3 className='font-semibold'>{control.title}</h3>
                    <p className='text-muted-foreground mt-2 text-sm text-pretty'>
                      {control.description}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section id='two-ai-modes' className='bg-muted/20'>
        <Container>
          <SectionHeading
            eyebrow='Human + AI calling'
            title={t('sections.modes')}
            description='Ringee supports AI around the call and AI on the call. They are different tools on the same infrastructure.'
          />
          <div className='mt-10 grid gap-5 lg:grid-cols-2'>
            <Card className='h-full p-7'>
              <Workflow className='h-7 w-7 text-emerald-700 dark:text-emerald-300' />
              <p className='text-muted-foreground mt-5 text-xs font-semibold tracking-wide uppercase'>
                AI orchestration
              </p>
              <h3 className='mt-2 text-xl font-semibold'>
                AI prepares; a person speaks
              </h3>
              <p className='text-muted-foreground mt-3 text-pretty'>
                ChatGPT, Claude, MCP agents, or the CLI can prospect, build a
                queue, ring a teammate, log outcomes, and schedule follow-up.
              </p>
              <Link
                href='/features/ai-call-automation'
                className='mt-6 inline-flex font-semibold text-emerald-700 hover:underline dark:text-emerald-300'
              >
                Explore AI call automation →
              </Link>
            </Card>
            <Card className='h-full border-emerald-500/25 bg-emerald-500/5 p-7'>
              <BrainCircuit className='h-7 w-7 text-emerald-700 dark:text-emerald-300' />
              <p className='mt-5 text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-300'>
                AI voice agent
              </p>
              <h3 className='mt-2 text-xl font-semibold'>
                AI places and speaks
              </h3>
              <p className='text-muted-foreground mt-3 text-pretty'>
                A configured Ringee agent originates the call, runs the
                conversation, uses its tools, and returns a reviewable result.
              </p>
              <p className='mt-6 inline-flex font-semibold text-emerald-700 dark:text-emerald-300'>
                You are on this page
              </p>
            </Card>
          </div>
        </Container>
      </Section>

      <FaqSection
        faqs={FAQS}
        description='Clear answers about what Ringee AI voice agents do today.'
      />

      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': `${SITE_URL}/ai-voice-agents#webpage`,
          url: `${SITE_URL}/ai-voice-agents`,
          name: PAGE_TITLE,
          description: PAGE_DESCRIPTION,
          isPartOf: { '@id': `${SITE_URL}/#website` },
          about: { '@id': `${SITE_URL}/#software` },
          mainEntity: { '@id': `${SITE_URL}/#software` }
        }}
      />
    </DetailLayout>
  );
}
