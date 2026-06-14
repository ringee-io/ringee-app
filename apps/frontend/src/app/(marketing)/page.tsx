import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { buildMetadata } from '@/features/marketing/seo';
import { CtaSection } from '@/features/marketing/components/cta-section';
import {
  JsonLd,
  softwareAppJsonLd
} from '@/features/marketing/components/json-ld';
import { SITE_URL } from '@/features/marketing/site';

// Reuse the existing rich landing showcases (dialer, agentic AI, features,
// campaigns) rather than rebuilding them.
import Hero from '@/features/landing/components/hero';
import { HomeShowcase } from '@/features/marketing/components/home-showcase';

export const metadata: Metadata = buildMetadata({
  title: 'Ringee — Affordable Outbound Calling Software for Modern Teams',
  description:
    'Ringee is affordable outbound calling software for SDR teams, recruiters, agencies, freelancers, and outbound operators. Call more leads, track outcomes, record and transcribe calls, sync your CRM, and automate with AI — without expensive per-seat pricing.',
  path: '/'
});

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard/overview');

  return (
    <>
      {/* Section 1 — Hero (dialer + agentic AI toggle) */}
      <Hero />

      {/* Section 2 — Product showcase (dialer, agentic AI, features, campaigns) */}
      <HomeShowcase />

      {/* Section 3 — Final CTA */}
      <CtaSection />

      <JsonLd
        data={softwareAppJsonLd({
          name: 'Ringee',
          description:
            'Affordable outbound calling software for SDR teams, recruiters, agencies, freelancers, and outbound operators. Call leads, run campaigns, record and transcribe calls, sync your CRM, and automate outbound with AI.',
          url: SITE_URL
        })}
      />
    </>
  );
}
