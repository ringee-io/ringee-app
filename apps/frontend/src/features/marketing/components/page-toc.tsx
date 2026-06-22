'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { cn } from '@ringee/frontend-shared/lib/utils';

type TocItem = { id: string; text: string };

/** Turn heading text into a stable, URL-safe anchor id. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Collect the page's section headings (`<h2>`) from the content area, assign
 * them stable anchor ids, and return them in document order. Headings inside a
 * `[data-toc-exclude]` subtree (the sidebar itself) or flagged with
 * `[data-toc-ignore]` (e.g. the closing CTA) are skipped.
 */
function collectHeadings(): TocItem[] {
  const main = document.querySelector('main');
  if (!main) return [];

  const used = new Set<string>();
  const items: TocItem[] = [];

  main.querySelectorAll<HTMLHeadingElement>('h2').forEach((heading) => {
    if (heading.closest('[data-toc-exclude]')) return;
    if (heading.hasAttribute('data-toc-ignore')) return;

    const text = heading.textContent?.trim();
    if (!text) return;

    let id = heading.id || slugify(text);
    if (!id) return;
    // Guarantee uniqueness across repeated labels on the same page.
    let unique = id;
    let n = 2;
    while (used.has(unique)) unique = `${id}-${n++}`;
    id = unique;
    used.add(id);

    if (!heading.id) heading.id = id;
    items.push({ id, text });
  });

  return items;
}

/**
 * In-page table of contents for content-heavy marketing pages. Reads the
 * rendered section headings, tracks the one currently in view (scroll-spy), and
 * renders a compact docs-style rail. Renders nothing when a page has too few
 * sections to be worth indexing.
 */
export function PageToc() {
  const pathname = usePathname();
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  // Re-scan whenever the route changes (the layout persists across sibling
  // detail pages, so children swap without a remount).
  useEffect(() => {
    // Defer to the next frame so the new page's DOM is in place.
    const raf = requestAnimationFrame(() => {
      const next = collectHeadings();
      setItems(next);
      setActiveId(next[0]?.id ?? '');
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  // Scroll-spy: highlight the last heading scrolled past the navbar.
  useEffect(() => {
    if (!items.length) return;

    const onScroll = () => {
      const offset = 96; // clears the sticky navbar
      let current = items[0].id;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top - offset <= 0) {
          current = item.id;
        }
      }
      setActiveId(current);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [items]);

  if (items.length < 2) return null;

  return (
    <nav aria-label='On this page' className='text-sm'>
      <p className='text-muted-foreground mb-3 px-4 text-xs font-semibold tracking-wide uppercase'>
        On this page
      </p>
      <ul className='border-border/60 border-l'>
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? 'location' : undefined}
                className={cn(
                  '-ml-px block border-l-2 py-1.5 pr-2 pl-4 text-pretty transition-colors',
                  active
                    ? 'border-emerald-500 font-medium text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground hover:text-foreground hover:border-border border-transparent'
                )}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
