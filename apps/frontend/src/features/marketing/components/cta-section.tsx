import { Container, CtaButtons, Section } from './primitives';

/** Conversion band used at the bottom of most pages. */
export function CtaSection({
  title = 'Start calling more leads today',
  description = 'Create a free Ringee account and place your first call in minutes. No credit card required to start.',
  primaryHref = '/auth/sign-up',
  primaryLabel = 'Start calling for free',
  secondaryHref = '/pricing',
  secondaryLabel = 'View pricing'
}: {
  title?: string;
  description?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <Section>
      <Container>
        <div className='border-border/70 from-muted/60 to-background relative overflow-hidden rounded-3xl border bg-gradient-to-b px-6 py-14 text-center sm:px-12'>
          <h2 className='mx-auto max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl'>
            {title}
          </h2>
          <p className='text-muted-foreground mx-auto mt-4 max-w-xl text-lg text-pretty'>
            {description}
          </p>
          <CtaButtons
            className='mt-8 items-center justify-center'
            primaryHref={primaryHref}
            primaryLabel={primaryLabel}
            secondaryHref={secondaryHref}
            secondaryLabel={secondaryLabel}
          />
        </div>
      </Container>
    </Section>
  );
}
