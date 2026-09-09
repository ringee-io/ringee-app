import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';

import { buildMetadata } from '@/features/marketing/seo';
import { AgentSession } from '@/features/marketing/components/agent-session';
import { CodeBlock } from '@/features/marketing/components/code-block';
import { RenderingSwitch } from '@/features/marketing/components/rendering-switch';
import {
  ButtonLink,
  Card,
  Container,
  Eyebrow,
  Section
} from '@/features/marketing/components/primitives';
import {
  AGENT_SESSION,
  MACHINE_MD_PATH,
  MACHINE_SURFACES,
  TOOL_SURFACE,
  buildClaimsDocument
} from '@/features/marketing/content/machine-view';
import {
  DOCS_MCP_CONNECT_URL,
  DOCS_URL,
  SITE_URL
} from '@/features/marketing/site';

export const metadata: Metadata = buildMetadata({
  title: 'Machine view — what an AI agent sees on Ringee',
  description:
    'The machine rendering of ringee.io: a replay of the outbound loop against the surfaces Ringee actually serves — llms.txt, Agent Skills, the MCP server — and the generated claims document behind them.',
  path: '/machine'
});

/**
 * `/machine` — the same site, rendered for the thing that reads it.
 *
 * Ringee is driven by agents, so the marketing site owes them a page that is
 * not a brochure: what an agent finds when it lands on the domain, the loop it
 * would actually run, and the claims document it can fetch as bytes at
 * `/machine.md`. Everything on the page comes from the same content modules
 * that render the human home page, so the two cannot disagree.
 *
 * The page itself is an ordinary marketing page — same theme, same primitives
 * as every other route. Only the transcript and the document are dark, the way
 * a terminal and a code block are dark everywhere else on the site.
 */
export default function MachineViewPage() {
  const claims = buildClaimsDocument();

  return (
    <Section className='pt-14 pb-20 sm:pt-16 sm:pb-24'>
      <Container className='flex flex-col gap-14'>
        <div className='flex flex-col gap-10'>
          <RenderingSwitch active='machine' />

          <div className='flex max-w-3xl flex-col gap-5'>
            <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
              Machine view
            </h1>
            <p className='text-muted-foreground font-mono text-sm leading-6 italic'>
              {'// '}parity by construction: everything below is generated from
              the same objects that render the human page. Same truth, two
              renderings. The session is a replay of the outbound loop —
              discover, install, connect, prospect, dial, follow up — against
              the surfaces Ringee actually serves.
            </p>
            <p className='text-muted-foreground/70 font-mono text-sm italic'>
              what an agent sees · {TOOL_SURFACE.total} tools · one step that is
              still a person&rsquo;s
            </p>
          </div>
        </div>

        <AgentSession lines={AGENT_SESSION} />

        <div className='flex flex-col gap-6'>
          <Eyebrow>Surfaces · no account required</Eyebrow>
          <ul className='grid gap-4 sm:grid-cols-2'>
            {MACHINE_SURFACES.map((surface) => (
              <li key={surface.href}>
                <Link
                  href={surface.href}
                  {...(surface.external
                    ? { target: '_blank', rel: 'noreferrer noopener' }
                    : {})}
                  className='block h-full'
                >
                  <Card className='hover:border-foreground/30 flex h-full flex-col gap-2 transition-colors'>
                    <span className='flex items-center gap-1.5 font-mono text-sm font-medium break-all text-emerald-600 dark:text-emerald-400'>
                      {surface.label}
                      <ArrowUpRight
                        className='h-3.5 w-3.5 shrink-0'
                        aria-hidden
                      />
                    </span>
                    <span className='text-muted-foreground text-sm'>
                      {surface.blurb}
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className='flex flex-col gap-6'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <Eyebrow>Claims document</Eyebrow>
            <Link
              href={MACHINE_MD_PATH}
              className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-mono text-xs transition-colors'
            >
              View raw
              <ArrowUpRight className='h-3.5 w-3.5' aria-hidden />
            </Link>
          </div>
          <CodeBlock
            code={claims}
            label={`GET ${SITE_URL.replace('https://', '')}${MACHINE_MD_PATH}`}
            language='markdown'
            bodyClassName='max-h-[34rem] overflow-y-auto'
          />
        </div>

        <div className='border-border/70 flex flex-col gap-6 border-t pt-12'>
          <h2 className='max-w-2xl text-2xl font-bold tracking-tight text-balance sm:text-3xl'>
            Connect an agent, then let a person take the call
          </h2>
          <p className='text-muted-foreground max-w-2xl text-pretty'>
            Install the skills from this domain, point your MCP client at your
            workspace URL, and the loop above runs on your own contacts.
          </p>
          <div className='flex flex-col gap-3 sm:flex-row sm:gap-4'>
            <ButtonLink href={DOCS_MCP_CONNECT_URL} external withArrow>
              Connect the MCP server
            </ButtonLink>
            <ButtonLink href={DOCS_URL} variant='secondary' external withArrow>
              Developer docs
            </ButtonLink>
          </div>
        </div>
      </Container>
    </Section>
  );
}
