import type { ReactNode } from 'react';

import { PageToc } from './page-toc';
import { Breadcrumbs } from './breadcrumbs';

type DetailBreadcrumbItem = {
  name: string;
  href: string;
};

type DetailLayoutProps = {
  children: ReactNode;
  items?: DetailBreadcrumbItem[];
  cta?: ReactNode;
  showToc?: boolean;
};

/**
 * Layout for content-heavy "detail" marketing pages (feature, integration,
 * use-case, comparison, and the static company/legal pages). Adds a sticky
 * in-page table of contents in a left rail on large screens while leaving the
 * page's own full-width sections to flow in the content column. On smaller
 * screens the rail collapses and the page renders exactly as before.
 *
 * Wired in via a nested `layout.tsx` on each detail route, so index/listing
 * pages (which list contents rather than discuss one topic) never get a TOC.
 */
export function DetailLayout({
  children,
  items,
  cta,
  showToc = true
}: DetailLayoutProps) {
  return (
    <>
      {items?.length ? <Breadcrumbs items={items} /> : null}
      <div className='mx-auto w-full max-w-6xl px-4 pb-14 sm:px-4 lg:px-6'>
        {showToc ? (
          <div className='min-w-0 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[17rem_minmax(0,1fr)] xl:gap-10'>
            <aside
              data-toc-exclude
              className='hidden lg:sticky lg:top-[6.25rem] lg:block lg:self-start lg:pt-8'
            >
              <div className='border-border/70 bg-background/80 supports-[backdrop-filter]:bg-background/70 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl border px-4 py-5 shadow-[0_18px_45px_-30px_rgba(0,0,0,0.55)] backdrop-blur'>
                <PageToc />
              </div>
            </aside>
            <div className='min-w-0'>{children}</div>
          </div>
        ) : (
          <div className='min-w-0'>{children}</div>
        )}
      </div>
      {cta && cta}
    </>
  );
}

export default DetailLayout;
