import { Container, CtaButtons, Section } from './primitives';

/** Conversion band used at the bottom of most pages. */
export function CtaSection({
  title = 'Start calling more leads today',
  description = 'Book a personalized demo and see how Ringee fits your outbound workflow — pricing, setup, and your questions answered.',
  primaryHref = '/request-demo',
  primaryLabel = 'Request Demo',
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
          <h2
            data-toc-ignore
            className='mx-auto max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl'
          >
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
