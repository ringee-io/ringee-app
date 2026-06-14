import type { ReactNode } from 'react';

import { MarketingFooter } from '@/features/marketing/components/footer';
import { MarketingNavbar } from '@/features/marketing/components/navbar';

/**
 * Layout for the public marketing site. The root layout sets the app body to
 * `overflow-hidden` for the dashboard shell, so we re-enable normal document
 * scrolling here (the dashboard manages its own scroll containers instead).
 */
export default function MarketingLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <>
      <style
        // Re-enable native page scrolling for marketing routes only.
        dangerouslySetInnerHTML={{
          __html:
            'html,body{overflow:auto!important;overscroll-behavior:auto!important;height:auto!important}'
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
    </>
  );
}
