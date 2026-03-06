import type { Metadata } from 'next';

const BASE_URL = 'https://phone.ringee.io';
const SITE_NAME = 'Phone by Ringee.io';
const DEFAULT_OG_IMAGE = '/og-image.png';

export interface SEOParams {
  title: string;
  description: string;
  canonical?: string;
  keywords?: string[];
  image?: string;
  noIndex?: boolean;
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
}

/**
 * Generate consistent SEO metadata for marketing pages
 */
export function generateSEOMetadata({
  title,
  description,
  canonical,
  keywords,
  image = DEFAULT_OG_IMAGE,
  noIndex = false,
  type = 'website',
  publishedTime,
  modifiedTime
}: SEOParams): Metadata {
  const fullTitle = `${title} | ${SITE_NAME}`;
  const url = canonical ? `${BASE_URL}${canonical}` : undefined;
  const imageUrl = image.startsWith('http') ? image : `${BASE_URL}${image}`;

  return {
    title: fullTitle,
    description,
    keywords: keywords?.join(', '),
    alternates: canonical ? { canonical: url } : undefined,
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type,
      title: fullTitle,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'en_US',
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title
        }
      ],
      ...(type === 'article' && publishedTime
        ? {
            publishedTime,
            modifiedTime: modifiedTime || publishedTime,
            authors: [SITE_NAME]
          }
        : {})
    },
    twitter: {
      card: 'summary_large_image',
      site: '@ringeeio',
      creator: '@ringeeio',
      title: fullTitle,
      description,
      images: [imageUrl]
    }
  };
}

/**
 * Page configuration for sitemap and footer link generation
 */
export interface PageConfig {
  path: string;
  title: string;
  description: string;
  priority?: number;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  category?: 'product' | 'solutions' | 'resources' | 'company';
}

/**
 * All marketing pages configuration - used for sitemap and footer generation
 */
export const MARKETING_PAGES: PageConfig[] = [
  // Core pages
  { path: '/', title: 'Home', description: 'Virtual phone numbers and international calls from your browser', priority: 1.0, changeFrequency: 'daily' },
  { path: '/sign-in', title: 'Sign In', description: 'Sign in to your Phone by Ringee.io account', priority: 0.8 },
  { path: '/sign-up', title: 'Sign Up', description: 'Create your free Phone by Ringee.io account', priority: 0.9 },
  
  // Product pages
  { path: '/features', title: 'Features', description: 'All Phone by Ringee.io features', priority: 0.9, category: 'product' },
  { path: '/features/caller-id', title: 'Caller ID', description: 'Custom caller ID for professional calls', priority: 0.8, category: 'product' },
  { path: '/features/call-recording', title: 'Call Recording', description: 'Record and save your calls securely', priority: 0.8, category: 'product' },
  { path: '/features/virtual-numbers', title: 'Virtual Numbers', description: 'Get virtual phone numbers in 100+ countries', priority: 0.8, category: 'product' },
  { path: '/features/call-history', title: 'Call History', description: 'Complete call logs and analytics', priority: 0.8, category: 'product' },
  { path: '/features/contacts', title: 'Contacts', description: 'Manage your contacts in one place', priority: 0.8, category: 'product' },
  { path: '/features/webrtc-calling', title: 'WebRTC Calling', description: 'Browser-based calling with WebRTC technology', priority: 0.8, category: 'product' },
  { path: '/pricing', title: 'Pricing', description: 'Simple pay-as-you-go pricing', priority: 0.9, category: 'product' },
  { path: '/rate', title: 'Call Rates', description: 'International calling rates by country', priority: 0.8, category: 'product' },
  { path: '/buy-numbers', title: 'Buy Numbers', description: 'Purchase virtual phone numbers', priority: 0.8, category: 'product' },
  
  // Solutions / Use Cases
  { path: '/use-cases', title: 'Use Cases', description: 'How different professionals use Phone by Ringee.io', priority: 0.9, category: 'solutions' },
  { path: '/use-cases/freelancers', title: 'For Freelancers', description: 'Virtual phone solution for freelancers', priority: 0.8, category: 'solutions' },
  { path: '/use-cases/sales-teams', title: 'For Sales Teams', description: 'Calling solution for sales professionals', priority: 0.8, category: 'solutions' },
  { path: '/use-cases/real-estate', title: 'For Real Estate', description: 'Phone solution for real estate agents', priority: 0.8, category: 'solutions' },
  { path: '/use-cases/small-call-centers', title: 'For Small Call Centers', description: 'Affordable call center solution', priority: 0.8, category: 'solutions' },
  { path: '/use-cases/remote-workers', title: 'For Remote Workers', description: 'Stay connected while working remotely', priority: 0.8, category: 'solutions' },
  
  // Resources
  { path: '/compare', title: 'Comparisons', description: 'Compare Phone by Ringee.io with alternatives', priority: 0.9, category: 'resources' },
  { path: '/compare/ringee-vs-skype', title: 'Ringee vs Skype', description: 'Detailed comparison with Skype', priority: 0.8, category: 'resources' },
  { path: '/compare/ringee-vs-google-voice', title: 'Ringee vs Google Voice', description: 'Detailed comparison with Google Voice', priority: 0.8, category: 'resources' },
  { path: '/compare/web-dialer-vs-softphone', title: 'Web Dialer vs Softphone', description: 'Browser calling vs softphone apps', priority: 0.7, category: 'resources' },
  { path: '/compare/pay-as-you-go-vs-subscription', title: 'Pay-as-you-go vs Subscription', description: 'Pricing model comparison', priority: 0.7, category: 'resources' },
  { path: '/guides', title: 'Guides', description: 'Tutorials and guides for VoIP and calling', priority: 0.9, category: 'resources' },
  { path: '/guides/voip-glossary', title: 'VoIP Glossary', description: 'Complete glossary of VoIP terms', priority: 0.7, category: 'resources' },
  { path: '/guides/choosing-phone-number', title: 'Choosing a Phone Number', description: 'Guide to selecting the right virtual number', priority: 0.7, category: 'resources' },
  { path: '/guides/browser-calling-guide', title: 'Browser Calling Guide', description: 'How to make calls from your browser', priority: 0.7, category: 'resources' },
  { path: '/guides/international-calling-rates', title: 'International Calling Rates Guide', description: 'Understanding international calling costs', priority: 0.7, category: 'resources' },
  { path: '/faq', title: 'FAQ', description: 'Frequently asked questions', priority: 0.8, category: 'resources' },
  
  // Company
  { path: '/trust', title: 'Trust & Security', description: 'Our commitment to security and privacy', priority: 0.8, category: 'company' },
  { path: '/privacy', title: 'Privacy Policy', description: 'How we handle your data', priority: 0.5, category: 'company' },
  { path: '/terms', title: 'Terms of Service', description: 'Terms and conditions of use', priority: 0.5, category: 'company' },
];

/**
 * Get pages by category for footer links
 */
export function getPagesByCategory(category: PageConfig['category']): PageConfig[] {
  return MARKETING_PAGES.filter(page => page.category === category);
}
