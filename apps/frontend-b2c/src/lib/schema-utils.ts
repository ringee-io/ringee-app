/**
 * Schema.org JSON-LD utilities for structured data
 */

const BASE_URL = 'https://phone.ringee.io';
const ORGANIZATION_NAME = 'Phone by Ringee.io';
const LOGO_URL = `${BASE_URL}/android-chrome-512x512.png`;

export interface FAQItem {
  question: string;
  answer: string;
}

export interface ArticleData {
  title: string;
  description: string;
  url: string;
  publishedDate: string;
  modifiedDate?: string;
  image?: string;
}

export interface ProductData {
  name: string;
  description: string;
  price?: string;
  priceCurrency?: string;
  image?: string;
}

export interface ComparisonData {
  productName: string;
  competitorName: string;
  description: string;
}

/**
 * Generate Organization schema (for company/trust pages)
 */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: ORGANIZATION_NAME,
    url: BASE_URL,
    logo: LOGO_URL,
    sameAs: [
      'https://x.com/ringeeio',
      'https://www.linkedin.com/company/ringee-io',
      'https://github.com/ringee-co'
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'support@ringee.io',
      contactType: 'customer support',
      availableLanguage: ['English', 'Spanish']
    }
  };
}

/**
 * Generate FAQPage schema
 */
export function faqPageSchema(questions: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(q => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer
      }
    }))
  };
}

/**
 * Generate Article/BlogPosting schema
 */
export function articleSchema(article: ArticleData) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    url: `${BASE_URL}${article.url}`,
    datePublished: article.publishedDate,
    dateModified: article.modifiedDate || article.publishedDate,
    image: article.image || LOGO_URL,
    author: {
      '@type': 'Organization',
      name: ORGANIZATION_NAME,
      url: BASE_URL
    },
    publisher: {
      '@type': 'Organization',
      name: ORGANIZATION_NAME,
      logo: {
        '@type': 'ImageObject',
        url: LOGO_URL
      }
    }
  };
}

/**
 * Generate Product schema
 */
export function productSchema(product: ProductData) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.image || LOGO_URL,
    brand: {
      '@type': 'Brand',
      name: ORGANIZATION_NAME
    },
    offers: {
      '@type': 'Offer',
      price: product.price || '0',
      priceCurrency: product.priceCurrency || 'USD',
      availability: 'https://schema.org/InStock'
    }
  };
}

/**
 * Generate SoftwareApplication schema (for the main product)
 */
export function softwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: ORGANIZATION_NAME,
    applicationCategory: 'CommunicationApplication',
    operatingSystem: 'Web, iOS, Android',
    url: BASE_URL,
    description:
      'Get virtual phone numbers in 100+ countries and make international calls directly from your browser. The best Skype alternative — no downloads, no SIM cards, rates up to 90% cheaper.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '520'
    },
    featureList: [
      'Virtual phone numbers in 100+ countries',
      'Make and receive international calls',
      'Make calls to 180+ countries',
      'Browser-based calling - no downloads',
      'Call recording',
      'Voicemail',
      'Contact management',
      'Rates up to 90% cheaper than traditional carriers'
    ]
  };
}

/**
 * Generate BreadcrumbList schema
 */
export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${BASE_URL}${item.url}`
    }))
  };
}

/**
 * Generate HowTo schema (for guide pages)
 */
export function howToSchema(data: {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
  totalTime?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: data.name,
    description: data.description,
    totalTime: data.totalTime,
    step: data.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text
    }))
  };
}

/**
 * JSON-LD Script component helper
 */
export function jsonLdScript(schema: object): string {
  return JSON.stringify(schema);
}
