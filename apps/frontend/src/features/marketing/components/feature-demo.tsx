'use client';

import dynamic from 'next/dynamic';

import { Container, Section, SectionHeading } from './primitives';

/**
 * The interactive landing demos pull in the real DialPad, a
 * react-grid-layout-based campaign workspace, and framer-motion. Those break the
 * Pages-Router prerender fallback when they enter the SSR/export graph (the same
 * fragility worked around in next.config and home-showcase), so we load every
 * demo client-only — exactly how the home page renders them. Each demo is passed
 * `embedded`, which drops its own marketing header and full-bleed chrome so it
 * sits cleanly under this section's heading.
 */
const DialerShowcase = dynamic(
  () => import('@/features/landing/components/dialer-showcase'),
  { ssr: false }
);
const Campaigns = dynamic(
  () => import('@/features/landing/components/campaigns'),
  { ssr: false }
);
const LiveAgentDemo = dynamic(
  () =>
    import('@/features/landing/components/agentic-mode').then(
      (m) => m.LiveAgentDemo
    ),
  { ssr: false }
);

export type FeatureDemoKey = 'manual-dialer' | 'campaigns' | 'agentic';

function DemoBody({ demo }: { demo: FeatureDemoKey }) {
  switch (demo) {
    case 'manual-dialer':
      return <DialerShowcase embedded />;
    case 'campaigns':
      return <Campaigns embedded />;
    case 'agentic':
      return <LiveAgentDemo embedded />;
    default:
      return null;
  }
}

/**
 * "See it in action" section for content-heavy marketing detail pages. Renders a
 * single `<h2>` (picked up by the page's table of contents) above the matching
 * interactive product demo reused from the landing page.
 */
export function FeatureDemo({
  demo,
  title = 'See it in action',
  description
}: {
  demo: FeatureDemoKey;
  title?: string;
  description?: string;
}) {
  return (
    <Section id='demo' className='bg-muted/20'>
      <Container>
        <SectionHeading title={title} description={description} align='left' />
        <div className='mt-10'>
          <DemoBody demo={demo} />
        </div>
      </Container>
    </Section>
  );
}

export default FeatureDemo;
