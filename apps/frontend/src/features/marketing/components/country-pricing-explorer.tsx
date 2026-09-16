'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';

/**
 * The country price list with a client-side filter.
 *
 * Every row is rendered on the server and only hidden as the visitor types, so
 * a crawler sees the complete list and a person sees the one country they came
 * for. The rows are passed in already priced — this component sorts and
 * filters, it never computes a price.
 */

export type CountryRow = {
  slug: string;
  name: string;
  flag: string;
  regionLabel: string;
  types: string[];
  fromMonthly: string;
  callFrom: string | null;
};

export function CountryPricingExplorer({ rows }: { rows: CountryRow[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        row.regionLabel.toLowerCase().includes(needle) ||
        row.types.some((type) => type.toLowerCase().includes(needle))
    );
  }, [query, rows]);

  return (
    <div>
      <label className='relative block max-w-md'>
        <span className='sr-only'>Search countries</span>
        <Search
          className='text-muted-foreground pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2'
          aria-hidden
        />
        <input
          type='search'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder='Search a country — Spain, Mexico, Philippines…'
          className='border-border/80 bg-background focus-visible:ring-primary h-12 w-full rounded-xl border pr-4 pl-11 text-sm focus-visible:ring-2 focus-visible:outline-none'
        />
      </label>

      <div className='border-border/70 mt-6 overflow-x-auto rounded-2xl border'>
        <table className='w-full border-collapse text-left text-sm'>
          <thead>
            <tr className='border-border/70 bg-muted/40 border-b'>
              <th className='p-4 font-semibold'>Country</th>
              <th className='p-4 font-semibold'>Number types</th>
              <th className='p-4 font-semibold'>Numbers from</th>
              <th className='p-4 font-semibold'>Calls from</th>
              <th className='p-4 font-semibold'>
                <span className='sr-only'>Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.slug}
                className='border-border/50 hover:bg-muted/30 border-b transition-colors last:border-0'
              >
                <th scope='row' className='p-4 font-medium'>
                  <Link
                    href={`/phone-numbers/${row.slug}`}
                    className='flex items-center gap-2 hover:underline'
                  >
                    <span className='text-lg' aria-hidden>
                      {row.flag}
                    </span>
                    {row.name}
                  </Link>
                  <span className='text-muted-foreground block text-xs'>
                    {row.regionLabel}
                  </span>
                </th>
                <td className='text-muted-foreground p-4'>
                  {row.types.join(', ')}
                </td>
                <td className='p-4 font-semibold whitespace-nowrap'>
                  {row.fromMonthly}
                  <span className='text-muted-foreground font-normal'>
                    {' '}
                    /mo
                  </span>
                </td>
                <td className='p-4 whitespace-nowrap'>
                  {row.callFrom ? (
                    <>
                      {row.callFrom}
                      <span className='text-muted-foreground'> /min</span>
                    </>
                  ) : (
                    <span className='text-muted-foreground'>On request</span>
                  )}
                </td>
                <td className='p-4 text-right'>
                  <Link
                    href={`/phone-numbers/${row.slug}`}
                    className='text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline'
                  >
                    View
                    <ArrowRight className='h-4 w-4' aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 ? (
        <p className='text-muted-foreground mt-6 text-sm'>
          No country matches “{query}”. We can still source numbers in more
          countries on request — ask us and we will check the carrier inventory
          for you.
        </p>
      ) : (
        <p className='text-muted-foreground mt-4 text-sm'>
          Showing {filtered.length} of {rows.length} countries.
        </p>
      )}
    </div>
  );
}
