import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, BookOpen, X } from 'lucide-react';

import {
  ButtonLink,
  Card,
  CheckList,
  Container,
  CtaButtons,
  Eyebrow,
  Section,
  SectionHeading
} from './primitives';

/** Detail-page hero: eyebrow, the page's single H1, intro paragraphs, CTAs. */
export function DetailHero({
  eyebrow,
  title,
  intro
}: {
  eyebrow: string;
  title: string;
  intro: string[];
}) {
  return (
    <Section className='pt-10 pb-8 sm:pt-12'>
      <Container className='max-w-3xl'>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className='mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl'>
          {title}
        </h1>
        <div className='mt-6 flex flex-col gap-4'>
          {intro.map((paragraph) => (
            <p
              key={paragraph.slice(0, 32)}
              className='text-muted-foreground text-lg text-pretty'
            >
              {paragraph}
            </p>
          ))}
        </div>
        <CtaButtons className='mt-8' />
      </Container>
    </Section>
  );
}

/**
 * Hands a reader off to the matching section of docs.ringee.io. Rendered only
 * when a page has a real docs counterpart — a link to the docs root would send
 * people somewhere they have to start navigating from scratch.
 */
export function DocsCallout({
  href,
  title = 'Read the developer docs',
  description,
  label = 'Open documentation'
}: {
  href: string;
  title?: string;
  description: string;
  label?: string;
}) {
  return (
    <Section className='pt-0'>
      <Container>
        <Card className='flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-start gap-4'>
            <span className='bg-muted text-muted-foreground inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl'>
              <BookOpen className='h-5 w-5' aria-hidden />
            </span>
            <div>
              <h2 className='text-lg font-semibold'>{title}</h2>
              <p className='text-muted-foreground mt-1 text-sm text-pretty'>
                {description}
              </p>
            </div>
          </div>
          <ButtonLink
            href={href}
            variant='secondary'
            external
            withArrow
            className='shrink-0'
          >
            {label}
          </ButtonLink>
        </Card>
      </Container>
    </Section>
  );
}

/** Numbered "How it works" steps. */
export function HowItWorksSteps({
  steps,
  title = 'How it works'
}: {
  steps: { title: string; description: string }[];
  title?: string;
}) {
  return (
    <Section className='bg-muted/20'>
      <Container>
        <SectionHeading title={title} align='left' />
        <ol className='mt-10 grid gap-5 md:grid-cols-3'>
          {steps.map((step, index) => (
            <li key={step.title}>
              <Card className='h-full'>
                <span className='bg-primary text-primary-foreground inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold'>
                  {index + 1}
                </span>
                <h3 className='mt-4 text-lg font-semibold'>{step.title}</h3>
                <p className='text-muted-foreground mt-2 text-sm'>
                  {step.description}
                </p>
              </Card>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}

/** Side-by-side "Who it's for" and "Benefits" lists. */
export function WhoForAndBenefits({
  whoFor,
  benefits,
  whoForTitle = 'Who it’s for',
  benefitsTitle = 'Benefits'
}: {
  whoFor: string[];
  benefits: string[];
  whoForTitle?: string;
  benefitsTitle?: string;
}) {
  return (
    <Section>
      <Container>
        <div className='grid gap-10 md:grid-cols-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>{whoForTitle}</h2>
            <CheckList items={whoFor} className='mt-6' />
          </div>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>
              {benefitsTitle}
            </h2>
            <CheckList items={benefits} className='mt-6' />
          </div>
        </div>
      </Container>
    </Section>
  );
}

/** Ordered example-workflow list rendered as numbered steps. */
export function WorkflowList({
  steps,
  title = 'Example outbound workflow'
}: {
  steps: string[];
  title?: string;
}) {
  return (
    <Section className='bg-muted/20'>
      <Container className='max-w-3xl'>
        <SectionHeading title={title} align='left' />
        <ol className='mt-8 flex flex-col gap-4'>
          {steps.map((step, index) => (
            <li key={step} className='flex items-start gap-4'>
              <span className='border-border/70 text-muted-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold'>
                {index + 1}
              </span>
              <p className='pt-1'>{step}</p>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}

/** Grid of related links (features/integrations). */
export function RelatedLinks({
  title,
  items
}: {
  title: string;
  items: { name: string; href: string; tagline: string }[];
}) {
  if (!items.length) return null;
  return (
    <Section>
      <Container>
        <SectionHeading title={title} align='left' as='h2' />
        <div className='mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
          {items.map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className='hover:border-foreground/30 h-full transition-colors'>
                <div className='flex items-center justify-between gap-2'>
                  <h3 className='font-semibold'>{item.name}</h3>
                  <ArrowRight className='text-muted-foreground h-4 w-4' />
                </div>
                <p className='text-muted-foreground mt-2 text-sm'>
                  {item.tagline}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </Container>
    </Section>
  );
}

/** Simple two-column "X / Y" content used for pain points vs solutions. */
export function ProblemSolution({
  painPoints,
  solutions
}: {
  painPoints: string[];
  solutions: { title: string; description: string }[];
}) {
  return (
    <Section>
      <Container>
        <div className='grid gap-12 lg:grid-cols-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>The challenge</h2>
            <ul className='mt-6 flex flex-col gap-3'>
              {painPoints.map((item) => (
                <li key={item} className='flex items-start gap-3'>
                  <X
                    className='mt-0.5 h-5 w-5 shrink-0 text-rose-500/80 dark:text-rose-400/80'
                    aria-hidden
                  />
                  <span className='text-muted-foreground'>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>
              How Ringee helps
            </h2>
            <div className='mt-6 flex flex-col gap-5'>
              {solutions.map((solution) => (
                <div key={solution.title}>
                  <h3 className='font-semibold'>{solution.title}</h3>
                  <p className='text-muted-foreground mt-1 text-sm'>
                    {solution.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}

/** Reusable section title wrapper for arbitrary children. */
export function NamedSection({
  title,
  description,
  children,
  muted
}: {
  title: string;
  description?: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <Section className={muted ? 'bg-muted/20' : undefined}>
      <Container>
        <SectionHeading title={title} description={description} align='left' />
        <div className='mt-10'>{children}</div>
      </Container>
    </Section>
  );
}
