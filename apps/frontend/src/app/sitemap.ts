import type { MetadataRoute } from 'next';

import { SITE_LAST_MODIFIED, SITE_URL } from '@/features/marketing/site';
import { FEATURES } from '@/features/marketing/content/features';
import { INTEGRATIONS } from '@/features/marketing/content/integrations';
import { USE_CASES } from '@/features/marketing/content/use-cases';
import { COMPARISONS } from '@/features/marketing/content/comparisons';

/**
 * Sitemap for the public marketing site. Only valid, indexable public routes
 * are listed — no app, auth, or /docs URLs. `lastModified` mirrors the schema
 * freshness signal (SITE_LAST_MODIFIED).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = SITE_LAST_MODIFIED;

  const staticPaths: { path: string; priority: number }[] = [
    { path: '/', priority: 1 },
    { path: '/pricing', priority: 0.9 },
    { path: '/features', priority: 0.8 },
    { path: '/integrations', priority: 0.8 },
    { path: '/use-cases', priority: 0.8 },
    { path: '/alternatives', priority: 0.8 },
    { path: '/security', priority: 0.7 },
    { path: '/open-source', priority: 0.7 },
    { path: '/self-hosted', priority: 0.7 },
    { path: '/about', priority: 0.6 },
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
  const comparisonPaths = COMPARISONS.map((comparison) => ({
    path: `/compare/${comparison.slug}`,
    priority: 0.7
  }));

  return [
    ...staticPaths,
    ...featurePaths,
    ...integrationPaths,
    ...useCasePaths,
    ...comparisonPaths
  ].map(({ path, priority }) => ({
    url: path === '/' ? SITE_URL : `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: 'weekly',
    priority
  }));
}
