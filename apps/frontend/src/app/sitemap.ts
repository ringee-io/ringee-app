import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/features/marketing/site';
import { FEATURES } from '@/features/marketing/content/features';
import { INTEGRATIONS } from '@/features/marketing/content/integrations';
import { USE_CASES } from '@/features/marketing/content/use-cases';

/**
 * Sitemap for the public marketing site. Only valid, indexable public routes
 * are listed — no app, auth, /alternatives, or /docs URLs.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const staticPaths: { path: string; priority: number }[] = [
    { path: '/', priority: 1 },
    { path: '/pricing', priority: 0.9 },
    { path: '/features', priority: 0.8 },
    { path: '/integrations', priority: 0.8 },
    { path: '/use-cases', priority: 0.8 },
    { path: '/security', priority: 0.7 },
    { path: '/open-source', priority: 0.7 },
    { path: '/self-hosted', priority: 0.7 },
    { path: '/privacy', priority: 0.3 },
    { path: '/terms', priority: 0.3 },
    { path: '/support', priority: 0.4 }
  ];

  const featurePaths = FEATURES.map((feature) => ({
    path: `/features/${feature.slug}`,
    priority: 0.7
  }));
  const integrationPaths = INTEGRATIONS.map((integration) => ({
    path: `/integrations/${integration.slug}`,
    priority: 0.7
  }));
  const useCasePaths = USE_CASES.map((useCase) => ({
    path: `/use-cases/${useCase.slug}`,
    priority: 0.7
  }));

  return [
    ...staticPaths,
    ...featurePaths,
    ...integrationPaths,
    ...useCasePaths
  ].map(({ path, priority }) => ({
    url: path === '/' ? SITE_URL : `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: 'weekly',
    priority
  }));
}
