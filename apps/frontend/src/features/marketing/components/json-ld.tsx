import { SAME_AS, SITE_LAST_MODIFIED, SITE_NAME, SITE_URL } from '../site';

const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/**
 * Renders a JSON-LD <script>. Safe to use in server components; the payload is
 * serialized at render time so the structured data ships in the initial HTML.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type='application/ld+json'
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/**
 * Canonical Organization entity. Rendered once per marketing page (from the
 * marketing layout) and referenced by `@id` from the WebSite/Product schema so
 * every page resolves to a single, consistent company entity.
 */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: `${SITE_NAME}.io`,
    alternateName: SITE_NAME,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/android-chrome-512x512.png`,
      width: 512,
      height: 512
    },
    description:
      'Open-source, self-hostable outbound calling software for SDR teams, recruiters, agencies, startups, and freelancers — calls, campaigns, recording and transcription, CRM sync, and AI automation, without per-seat pricing.',
    sameAs: SAME_AS,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+18094055531',
      contactType: 'customer support',
      availableLanguage: 'English'
    }
  };
}

/**
 * WebSite entity (sitelinks/entity anchor). No SearchAction — Ringee's marketing
 * site has no public search endpoint, and an unbacked SearchAction is worse than
 * none.
 */
export function webSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    alternateName: `${SITE_NAME}.io`,
    url: SITE_URL,
    inLanguage: 'en-US',
    publisher: { '@id': ORG_ID },
    dateModified: SITE_LAST_MODIFIED
  };
}

/** BreadcrumbList structured data from an ordered list of crumbs. */
export function breadcrumbJsonLd(items: { name: string; href: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.href === '/' ? '' : item.href}`
    }))
  };
}

/**
 * FAQPage structured data from question/answer pairs. `speakable` marks the
 * Q&A region as voice-assistant readable (FAQPage extends WebPage).
 */
export function faqJsonLd(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['#faq']
    },
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer }
    }))
  };
}

/** Two standard offers (Freelancer free, Organization $20/mo), both in stock. */
function planOffers() {
  return [
    {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      name: 'Freelancer',
      availability: 'https://schema.org/InStock'
    },
    {
      '@type': 'Offer',
      price: '20',
      priceCurrency: 'USD',
      name: 'Organization',
      availability: 'https://schema.org/InStock'
    }
  ];
}

/**
 * SoftwareApplication structured data for the product. Declared once (homepage);
 * feature pages link back to it rather than redeclaring the whole app.
 */
export function softwareAppJsonLd({
  name,
  description,
  url
}: {
  name: string;
  description: string;
  url: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    url,
    description,
    isAccessibleForFree: true,
    license: 'https://opensource.org/licenses/MIT',
    dateModified: SITE_LAST_MODIFIED,
    offers: planOffers(),
    publisher: { '@id': ORG_ID }
  };
}
