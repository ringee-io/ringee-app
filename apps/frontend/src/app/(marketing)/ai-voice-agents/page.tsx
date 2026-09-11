import Link from 'next/link';
import type { Metadata } from 'next';
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
import { HumanAiCallingVisual } from '@/features/marketing/components/human-ai-calling';
import { JsonLd } from '@/features/marketing/components/json-ld';
import {
  ButtonLink,
  Card,
  Container,
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

export default function AiVoiceAgentsPage() {
  return (
    <DetailLayout
      showToc={false}
      items={[
        { name: 'Home', href: '/' },
        { name: 'AI Voice Agents', href: '/ai-voice-agents' }
      ]}
      cta={
        <CtaSection
          title='Give your next repeatable call to an AI voice agent'
          description='See how an agent would work with your calling number, knowledge, calendar, and desired outcomes.'
          secondaryHref='/features/ai-call-automation'
          secondaryLabel='Explore AI automation'
        />
      }
    >
      <Section className='pt-10 pb-16 sm:pt-16 sm:pb-24'>
        <Container className='grid items-center gap-12 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16'>
          <div>
            <div className='inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/8 px-3 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300'>
              <Bot className='h-3.5 w-3.5' aria-hidden />
              AI Voice Agents
            </div>
            <h1 className='mt-6 text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl'>
              AI voice agents that{' '}
              <span className='text-violet-700 dark:text-violet-400'>
                make the call.
              </span>
            </h1>
            <p className='text-foreground mt-6 max-w-2xl text-xl font-medium text-pretty'>
              The agent does not stop at preparing a list or ringing your
              device. It places the outbound call, speaks with the person, uses
              tools, and finishes the job.
            </p>
            <p className='text-muted-foreground mt-4 max-w-2xl text-lg text-pretty'>
              Run AI-led conversations and human-led dialing on the same open
              Ringee infrastructure, with one set of numbers, call records,
              recordings, outcomes, and integrations.
            </p>
            <div className='mt-8 flex flex-col gap-3 sm:flex-row'>
              <ButtonLink href='/request-demo'>Request a demo</ButtonLink>
              <ButtonLink
                href='/features/ai-call-automation'
                variant='secondary'
                withArrow
              >
                See automation options
              </ButtonLink>
            </div>
          </div>
          <HumanAiCallingVisual />
        </Container>
      </Section>

      <Section className='border-y border-emerald-500/15 bg-emerald-500/5 py-10 sm:py-12'>
        <Container>
          <p className='mx-auto max-w-4xl text-center text-2xl font-semibold tracking-tight text-balance sm:text-3xl'>
            Ringee is not only a cheaper seat in a dialer. It is open calling
            infrastructure where human teams and AI operators work from the same
            stack.
          </p>
        </Container>
      </Section>

      <Section id='capabilities'>
        <Container>
          <SectionHeading
            eyebrow='From dial to result'
            title='A voice agent with a real job to do'
            description='Configure the conversation once. Ringee gives the agent the calling, knowledge, tools, and result pipeline it needs to complete repeatable phone work.'
          />
          <div className='mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
            {CAPABILITIES.map((capability) => (
              <Card key={capability.title} className='h-full'>
                <span className='inline-flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300'>
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
            title='Start with a conversation pattern that already knows its tools'
            description='Each blueprint includes editable language and immutable safeguards around the actions that must stay correct.'
            align='left'
          />
          <div className='mt-10 grid gap-5 lg:grid-cols-2'>
            <Card className='relative h-full overflow-hidden p-7'>
              <div
                aria-hidden
                className='absolute -top-16 -right-16 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl'
              />
              <CalendarCheck className='h-8 w-8 text-violet-700 dark:text-violet-300' />
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
                className='absolute -top-16 -right-16 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl'
              />
              <BellRing className='h-8 w-8 text-amber-700 dark:text-amber-300' />
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
            title='Go from a tested conversation to a real phone call'
          />
          <ol className='mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4'>
            {SETUP_STEPS.map((step, index) => (
              <li key={step.title}>
                <Card className='h-full'>
                  <span className='inline-flex h-8 w-8 items-center justify-center rounded-full bg-violet-700 text-sm font-bold text-white dark:bg-violet-500'>
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
            <div className='relative grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center'>
              <div>
                <p className='text-sm font-semibold tracking-wide text-emerald-300 uppercase'>
                  One infrastructure
                </p>
                <h2 className='mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl'>
                  The operator changes. The calling system does not.
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
            title='Autonomous conversation does not mean unbounded action'
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
            title='Choose who should take each conversation'
            description='Ringee supports AI around the call and AI on the call. They are different tools on the same infrastructure.'
          />
          <div className='mt-10 grid gap-5 lg:grid-cols-2'>
            <Card className='h-full p-7'>
              <Workflow className='h-7 w-7 text-sky-700 dark:text-sky-300' />
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
                className='mt-6 inline-flex font-semibold text-sky-700 hover:underline dark:text-sky-300'
              >
                Explore AI call automation →
              </Link>
            </Card>
            <Card className='h-full border-violet-500/25 bg-violet-500/5 p-7'>
              <BrainCircuit className='h-7 w-7 text-violet-700 dark:text-violet-300' />
              <p className='mt-5 text-xs font-semibold tracking-wide text-violet-700 uppercase dark:text-violet-300'>
                AI voice agent
              </p>
              <h3 className='mt-2 text-xl font-semibold'>
                AI places and speaks
              </h3>
              <p className='text-muted-foreground mt-3 text-pretty'>
                A configured Ringee agent originates the call, runs the
                conversation, uses its tools, and returns a reviewable result.
              </p>
              <p className='mt-6 inline-flex font-semibold text-violet-700 dark:text-violet-300'>
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
