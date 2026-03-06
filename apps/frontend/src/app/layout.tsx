import Providers from '@/components/layout/providers';
import { Toaster } from '@ringee/frontend-shared/components/ui/sonner';
import { fontVariables } from '@ringee/frontend-shared/lib/font';
import ThemeProvider from '@/components/layout/ThemeToggle/theme-provider';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
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
    default: 'Ringee — Open Source Global Calling Platform',
    template: '%s | Ringee'
  },
  description:
    'Ringee is the open source VoIP platform that makes global calling 50× cheaper. Make and receive crystal-clear calls to 180+ countries from your browser or mobile. Self-host or use our cloud — perfect for sales teams, cold callers, and businesses that value transparency and control.',
  keywords: [
    'Ringee',
    'Ringee.io',
    'open source VoIP',
    'open source calling platform',
    'open source phone system',
    'open source sales dialer',
    'open source cold calling',
    'self-hosted VoIP',
    'self-hosted phone system',
    'open source business phone',
    'free open source calling',
    'open source communication tool',
    'open source call recording',
    'open source CRM calling',
    'open source telephony',
    'VoIP open source alternative',
    'open source twilio alternative',
    'VoIP app',
    'cold calling software',
    'sales dialer',
    'browser calling',
    'international calls',
    'receive calls online',
    'make calls online',
    'buy phone number',
    'virtual number',
    'call recording',
    'sales calling tool',
    'outbound calls',
    'inbound calls',
    'business phone system'
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
    title:
      'Ringee — Open Source VoIP Platform | 50× Cheaper Global Calling',
    description:
      'The open source VoIP platform for global calling. 50× cheaper than traditional rates. Make and receive calls to 180+ countries from your browser. Self-host or use our cloud — built for sales teams and modern businesses.',
    siteName: 'Ringee.io',
    images: [
      {
        url: 'https://www.ringee.io/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Ringee — Open source global calling platform'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    site: '@ringeeio',
    creator: '@ringeeio',
    title: 'Ringee — Open Source Global Calling Platform',
    description:
      'The open source VoIP platform that makes global calling 50× cheaper. Call, record, and manage contacts across 180+ countries. Self-host or use our cloud — built for sales teams and global businesses.',
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
  const activeThemeValue = cookieStore.get('active_theme')?.value || DEFAULT_THEME;
  const isScaled = activeThemeValue.endsWith('-scaled');

  return (
    <html lang='en' suppressHydrationWarning>
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
              applicationCategory: 'CommunicationApplication',
              operatingSystem: 'Web, Android',
              url: 'https://www.ringee.io',
              description:
                'Ringee is the open source VoIP platform for global calling — 50× cheaper than traditional rates. Make and receive calls to 180+ countries from your browser or mobile. Self-host or use our cloud. Record calls, manage contacts, and grow your business.',
              isAccessibleForFree: true,
              license: 'https://opensource.org/licenses/MIT',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD'
              },
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: '4.9',
                reviewCount: '320'
              },
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
                'https://github.com/ringee-co'
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
      </body>
    </html>
  );
}
