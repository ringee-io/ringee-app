import type { ReactNode } from 'react';

import { MarketingFooter } from '@/features/marketing/components/footer';
import { MarketingNavbar } from '@/features/marketing/components/navbar';
import {
  JsonLd,
  organizationJsonLd,
  webSiteJsonLd
} from '@/features/marketing/components/json-ld';

/**
 * Layout for the public marketing site. The root layout sets the app body to
 * `overflow-hidden` for the dashboard shell, so we re-enable normal document
 * scrolling here (the dashboard manages its own scroll containers instead).
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style
        // Re-enable native page scrolling for marketing routes only.
        //
        // The dashboard root layout sets `body { overflow: hidden }`. Simply
        // flipping body to `overflow: auto` re-enables scrolling but turns the
        // body into a scroll container, which breaks `position: sticky` on the
        // navbar (it anchors to the body's scrollport instead of the viewport
        // and scrolls away). Instead we make `html` the scroll container and
        // keep `body` at `overflow: visible` so sticky anchors to the viewport.
        dangerouslySetInnerHTML={{
          __html:
            'html{height:auto!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior:auto!important}body{height:auto!important;overflow:visible!important}'
        }}
      />
      <div className='bg-background text-foreground relative flex min-h-dvh flex-col'>
        {/* Dotted texture + soft green glow, echoing the original landing. */}
        <div aria-hidden className='pointer-events-none absolute inset-0 z-0'>
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] [background-size:24px_24px] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)]' />
          <div className='absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(16,185,129,0.12),transparent_70%)]' />
        </div>
        <div className='relative z-10 flex min-h-dvh flex-col'>
          <MarketingNavbar />
          <main className='flex-1'>{children}</main>
          <MarketingFooter />
        </div>
      </div>

      {/* Canonical entity anchors — one Organization + WebSite per marketing
          page. Product/Software schema is declared on the homepage only. */}
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={webSiteJsonLd()} />
    </>
  );
}
