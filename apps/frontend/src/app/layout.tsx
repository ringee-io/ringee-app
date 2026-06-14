import Providers from '@/components/layout/providers';
import { Toaster } from '@ringee/frontend-shared/components/ui/sonner';
import { fontVariables } from '@ringee/frontend-shared/lib/font';
import ThemeProvider from '@/components/layout/ThemeToggle/theme-provider';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import NextTopLoader from 'nextjs-toploader';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import './globals.css';
import './theme.css';
import Script from 'next/script';
import { CrispChat } from '@ringee/frontend-shared/components/crisp-chat';

const META_THEME_COLORS = {
  light: '#ffffff',
  dark: '#09090b'
};

export const metadata: Metadata = {
  title: {
    default: 'Ringee — Affordable Outbound Calling Software for Modern Teams',
    template: '%s | Ringee'
  },
  description:
    'Ringee is affordable outbound calling software for SDR teams, recruiters, agencies, freelancers, and outbound operators. Call more leads, track outcomes, record and transcribe calls, sync your CRM, and automate outbound with AI — without expensive per-seat pricing.',
  keywords: [
    'Ringee',
    'Ringee.io',
    'outbound calling software',
    'outbound dialer',
    'sales dialer',
    'cold calling software',
    'SDR calling software',
    'recruiter calling software',
    'browser calling',
    'call recording',
    'call transcription',
    'callbacks',
    'call outcomes',
    'CRM sync',
    'AI call automation',
    'MCP calling',
    'open source VoIP',
    'self-hosted calling',
    'affordable calling software',
    'unlimited users calling'
  ],
  authors: [{ name: 'Ringee.io', url: 'https://www.ringee.io' }],
  metadataBase: new URL('https://www.ringee.io'),
  alternates: {
    canonical: 'https://www.ringee.io'
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.ringee.io',
    title: 'Ringee — Affordable Outbound Calling Software for Modern Teams',
    description:
      'Outbound calling software for SDR teams, recruiters, agencies, freelancers, and outbound operators. Call more leads, track outcomes, record and transcribe calls, sync your CRM, and automate with AI — without per-seat pricing.',
    siteName: 'Ringee.io',
    images: [
      {
        url: 'https://www.ringee.io/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Ringee — affordable outbound calling software'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    site: '@ringeeio',
    creator: '@ringeeio',
    title: 'Ringee — Affordable Outbound Calling Software',
    description:
      'Call more leads, track outcomes, record and transcribe calls, sync your CRM, and automate outbound with AI tools like ChatGPT and Claude — without expensive per-seat pricing.',
    images: ['https://www.ringee.io/og-image.png']
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      {
        url: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        url: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png'
      }
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
  },
  category: 'business',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large'
    }
  }
};

export const viewport: Viewport = {
  themeColor: META_THEME_COLORS.dark
};

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const DEFAULT_THEME = 'default-scaled';
  const cookieStore = await cookies();
  const activeThemeValue =
    cookieStore.get('active_theme')?.value || DEFAULT_THEME;
  const isScaled = activeThemeValue.endsWith('-scaled');

  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* PWA manifest */}
        <link
          rel='manifest'
          href='/manifest.webmanifest'
          crossOrigin='use-credentials'
        />

        {/* iOS meta */}
        <meta name='apple-mobile-web-app-capable' content='yes' />
        <meta
          name='apple-mobile-web-app-status-bar-style'
          content='black-translucent'
        />
        <link rel='apple-touch-icon' href='/apple-touch-icon.png' />

        {/* App colors */}
        <meta name='theme-color' content={META_THEME_COLORS.light} />
        <meta name='msapplication-TileColor' content='#109FDC' />
        <meta name='application-name' content='Ringee' />
        <meta name='apple-mobile-web-app-title' content='Ringee' />

        {/* Theme sync */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.theme;
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const color = theme === 'dark' || (theme === 'system' && prefersDark)
                  ? '${META_THEME_COLORS.dark}'
                  : '${META_THEME_COLORS.light}';
                document.querySelector('meta[name="theme-color"]').setAttribute('content', color);
              } catch (_) {}
            `
          }}
        />

        {/* Structured Data — SoftwareApplication */}
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Ringee',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web, iOS',
              url: 'https://www.ringee.io',
              description:
                'Affordable outbound calling software for SDR teams, recruiters, agencies, freelancers, and outbound operators. Call leads, run campaigns, record and transcribe calls, sync your CRM, and automate outbound with AI. Open source and self-hostable.',
              isAccessibleForFree: true,
              license: 'https://opensource.org/licenses/MIT',
              offers: [
                {
                  '@type': 'Offer',
                  name: 'Freelancer',
                  price: '0',
                  priceCurrency: 'USD'
                },
                {
                  '@type': 'Offer',
                  name: 'Organization',
                  price: '20',
                  priceCurrency: 'USD'
                }
              ],
              publisher: {
                '@type': 'Organization',
                name: 'Ringee.io',
                url: 'https://www.ringee.io'
              }
            })
          }}
        />

        {/* Structured Data — Organization */}
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Ringee.io',
              url: 'https://www.ringee.io',
              logo: 'https://www.ringee.io/android-chrome-512x512.png',
              sameAs: [
                'https://x.com/ringeeio',
                'https://www.linkedin.com/company/ringee-io',
                'https://github.com/ringee-io/ringee-app'
              ],
              contactPoint: {
                '@type': 'ContactPoint',
                telephone: '+18094055531',
                contactType: 'customer support',
                availableLanguage: 'English'
              }
            })
          }}
        />

        {/* Google Analytics */}
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <>
            <Script
              strategy='afterInteractive'
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`}
            />
            <Script
              id='gtag-init'
              strategy='afterInteractive'
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}', {
                    page_path: window.location.pathname,
                  });
                `
              }}
            />
          </>
        )}

        {/* Ahrefs Analytics */}
        {process.env.NEXT_PUBLIC_AHREFS_KEY && (
          <Script
            src='https://analytics.ahrefs.com/analytics.js'
            data-key={process.env.NEXT_PUBLIC_AHREFS_KEY}
            async
            strategy='afterInteractive'
          />
        )}
      </head>

      <body
        className={cn(
          'bg-background overflow-hidden overscroll-none font-sans antialiased',
          activeThemeValue ? `theme-${activeThemeValue}` : '',
          isScaled ? 'theme-scaled' : '',
          fontVariables
        )}
      >
        <NextTopLoader color='var(--primary)' showSpinner={false} />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <NuqsAdapter>
            <ThemeProvider
              attribute='class'
              defaultTheme='dark'
              enableSystem={false}
              disableTransitionOnChange
              enableColorScheme
            >
              <Providers activeThemeValue={activeThemeValue as string}>
                <Toaster />
                <CrispChat />
                {children}
              </Providers>
            </ThemeProvider>
          </NuqsAdapter>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
