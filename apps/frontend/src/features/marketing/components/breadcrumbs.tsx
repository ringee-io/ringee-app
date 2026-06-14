import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { Container } from './primitives';
import { JsonLd, breadcrumbJsonLd } from './json-ld';

export type Crumb = { name: string; href: string };

/**
 * Visible breadcrumb trail + BreadcrumbList JSON-LD. The last crumb is the
 * current page and is not linked.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <Container>
      <nav aria-label='Breadcrumb' className='pt-8'>
        <ol className='text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm'>
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={item.href} className='flex items-center gap-1.5'>
                {isLast ? (
                  <span className='text-foreground font-medium' aria-current='page'>
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.href} className='hover:text-foreground'>
                    {item.name}
                  </Link>
                )}
                {!isLast ? (
                  <ChevronRight className='h-4 w-4' aria-hidden />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={breadcrumbJsonLd(items)} />
    </Container>
  );
}
