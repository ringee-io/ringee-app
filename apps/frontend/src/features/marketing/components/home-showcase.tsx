'use client';

import dynamic from 'next/dynamic';

import AgenticMode from '@/features/landing/components/agentic-mode';
import Features from '@/features/landing/components/features';

/**
 * The dialer and campaign showcases pull in the real DialPad and a
 * react-grid-layout-based workspace mock. Those break the Pages-Router
 * prerender fallback (/_document, /500) when they enter the SSR/export graph —
 * the same fragility the repo already works around in next.config. We load them
 * client-only (ssr:false), exactly how the original landing rendered them, while
 * keeping the text-rich AgenticMode and Features sections server-rendered for SEO.
 */
const DialerShowcase = dynamic(
  () => import('@/features/landing/components/dialer-showcase'),
  { ssr: false }
);
const Campaigns = dynamic(
  () => import('@/features/landing/components/campaigns'),
  { ssr: false }
);

export function HomeShowcase() {
  return (
    <section className='flex flex-col gap-6 sm:gap-10'>
      <DialerShowcase />
      <AgenticMode />
      <Features />
      <Campaigns />
    </section>
  );
}
