import type { MetadataRoute } from 'next';
import { MARKETING_PAGES } from '@/lib/seo-utils';

const BASE_URL = 'https://phone.ringee.io';

export default function sitemap(): MetadataRoute.Sitemap {
  const currentDate = new Date().toISOString().split('T')[0];

  return MARKETING_PAGES.map((page) => ({
    url: `${BASE_URL}${page.path}`,
    lastModified: currentDate,
    changeFrequency: page.changeFrequency || 'weekly',
    priority: page.priority || 0.7
  }));
}
