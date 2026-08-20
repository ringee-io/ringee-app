'use client';

import Image from 'next/image';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { cn } from '@ringee/frontend-shared/lib/utils';

/**
 * Partner marks from /public/companies, shared by the marketing sections that
 * show who Ringee talks to.
 *
 * They ship at wildly different aspect ratios — Attio and HubSpot are wide
 * wordmarks, Apollo and Prospeo are squares — so a single CSS height would
 * leave the squares as specks next to them. Each carries its own optical height
 * and width cap instead.
 *
 * Marks flagged `comingSoon` are the CRMs we don't ship yet: greyed out, not
 * clickable-looking, and they say "Coming soon" on hover rather than sitting
 * there implying a live integration.
 *
 * Used under nominative fair use to identify the integrations.
 */
export type CompanyLogoSpec = {
  src: string;
  alt: string;
  height: number;
  maxWidth: number;
  /** Single-colour marks that would vanish on a dark background. */
  invertOnDark?: boolean;
  /** Integration that isn't live yet: shown greyed out, and says so on hover. */
  comingSoon?: boolean;
};

export const COMPANY_LOGOS = {
  attio: {
    src: '/companies/attio.svg',
    alt: 'Attio',
    height: 20,
    maxWidth: 82,
    invertOnDark: true
  },
  hubspot: {
    src: '/companies/hubspot.svg',
    alt: 'HubSpot',
    height: 17,
    maxWidth: 90,
    comingSoon: true
  },
  salesforce: {
    src: '/companies/salesforce.svg',
    alt: 'Salesforce',
    height: 24,
    maxWidth: 40,
    comingSoon: true
  },
  odoo: { src: '/companies/odoo.svg', alt: 'Odoo', height: 20, maxWidth: 36 },
  apollo: {
    src: '/companies/apollo.png',
    alt: 'Apollo',
    height: 22,
    maxWidth: 22
  },
  prospeo: {
    src: '/companies/prospeo.svg',
    alt: 'Prospeo',
    height: 22,
    maxWidth: 22
  }
} satisfies Record<string, CompanyLogoSpec>;

/**
 * `onDark` is for marks sitting on a surface that is dark in *both* themes —
 * the terminal panels. Those need the invert unconditionally, where the normal
 * case only wants it when the page itself goes dark.
 */
export function CompanyLogo({
  logo,
  onDark,
  className
}: {
  logo: CompanyLogoSpec;
  onDark?: boolean;
  className?: string;
}) {
  const image = (
    <Image
      src={logo.src}
      alt={logo.alt}
      width={180}
      height={48}
      sizes='96px'
      style={{ height: logo.height, maxWidth: logo.maxWidth }}
      className={cn(
        'w-auto object-contain',
        logo.invertOnDark && (onDark ? 'invert' : 'dark:invert'),
        logo.comingSoon && 'opacity-40 grayscale',
        className
      )}
    />
  );

  if (!logo.comingSoon) return image;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-disabled
          className='inline-flex cursor-not-allowed items-center transition-opacity duration-200 hover:opacity-80 focus-visible:outline-none'
        >
          {image}
        </span>
      </TooltipTrigger>
      <TooltipContent>Coming soon</TooltipContent>
    </Tooltip>
  );
}
