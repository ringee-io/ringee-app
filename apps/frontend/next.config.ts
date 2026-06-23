import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
import withPWA from 'next-pwa' with { type: 'macro' };

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Security response headers applied to every route. HSTS, nosniff, framing,
// referrer, and permissions are safe defaults. A full Content-Security-Policy
// is intentionally NOT set here: the app loads Clerk, Stripe, Telnyx, GA,
// Ahrefs, Crisp, Firebase and Sentry, so a CSP needs a carefully tested
// allowlist and should be added/validated against production separately.
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // The web dialer uses WebRTC, so the microphone is allowed on same-origin.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(self), geolocation=(), browsing-topics=()'
  }
];

// Long-lived, immutable caching for static media in /public (images, fonts,
// audio). These assets are content-stable, so a one-year cache lets the browser
// and any edge/CDN reuse them instead of re-fetching on every page — directly
// reducing repeat HTTP requests and First Contentful Paint. Text files that
// change in place (robots.txt, ads.txt, sitemap, llms.txt) are intentionally
// excluded from this rule.
const STATIC_ASSET_CACHE = [
  {
    key: 'Cache-Control',
    value: 'public, max-age=31536000, immutable'
  }
];

// Define the base Next.js configuration
const baseConfig: NextConfig = {
  output: 'standalone',
  // Don't advertise the framework via the X-Powered-By header.
  poweredByHeader: false,
  // Gzip/Brotli the HTML and other text responses from the standalone server
  // so the document payload (flagged as oversized) ships compressed.
  compress: true,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source:
          '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif|woff|woff2|ttf|otf|mp3|wav)',
        headers: STATIC_ASSET_CACHE
      }
    ];
  },
  eslint: {
    ignoreDuringBuilds: true // ✅ Ignora errores de ESLint en el build
  },
  typescript: {
    ignoreBuildErrors: true
  },
  // optimizeFonts: false, // Prevents "getaddrinfo EAI_AGAIN fonts.googleapis.com" during Docker build
  images: {
    // Serve modern, smaller formats from the built-in optimizer. AVIF first,
    // then WebP, then the original — this is what keeps the heavy hero PNGs at
    // ~50 KB on the wire instead of ~600 KB.
    formats: ['image/avif', 'image/webp'],
    // Cache optimized images for 31 days so the optimizer isn't re-encoding the
    // same source on every request and downstream caches can hold them.
    minimumCacheTTL: 2678400,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.slingacademy.com',
        port: ''
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: ''
      }
    ]
  },
  transpilePackages: [
    'geist',
    '@ringee/frontend-shared',
    // react-grid-layout v2 ships ESM-only with subpath exports and pulls
    // react-resizable/react-draggable; route them through SWC so their
    // chunks land in the same module graph as our app and don't break the
    // /_not-found prerender.
    'react-grid-layout',
    'react-resizable',
    'react-draggable'
  ]
};

let configWithPlugins = baseConfig;

// Conditionally enable Sentry configuration
if (!process.env.NEXT_PUBLIC_SENTRY_DISABLED) {
  configWithPlugins = withSentryConfig(configWithPlugins, {
    // For all available options, see:
    // https://www.npmjs.com/package/@sentry/webpack-plugin#options
    // FIXME: Add your Sentry organization and project names
    org: process.env.NEXT_PUBLIC_SENTRY_ORG,
    project: process.env.NEXT_PUBLIC_SENTRY_PROJECT,
    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    reactComponentAnnotation: {
      enabled: true
    },

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: '/monitoring',

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Disable Sentry telemetry
    telemetry: false
  });
}

const nextConfig = withNextIntl(configWithPlugins);

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development'
})(nextConfig);
