import { SITE_NAME, SITE_URL } from '../site';

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

/** FAQPage structured data from question/answer pairs. */
export function faqJsonLd(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer }
    }))
  };
}

/** SoftwareApplication structured data for a feature/product page. */
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
    operatingSystem: 'Web, iOS',
    url,
    description,
    isAccessibleForFree: true,
    offers: [
      { '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Freelancer' },
      {
        '@type': 'Offer',
        price: '20',
        priceCurrency: 'USD',
        name: 'Organization'
      }
    ],
    publisher: {
      '@type': 'Organization',
      name: `${SITE_NAME}.io`,
      url: SITE_URL
    }
  };
}
