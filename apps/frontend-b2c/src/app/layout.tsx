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
import { B2CLayout } from '@/components/layout/b2c-layout';

const META_THEME_COLORS = {
  light: '#ffffff',
  dark: '#09090b'
};

export const metadata: Metadata = {
  title: {
    default: 'Your Open Source Virtual Phone, Simplified — Ringee.io | Skype Alternative',
    template: '%s | Phone by Ringee.io'
  },
  description:
    'Your open source virtual phone, simplified. Make calls, get numbers in 100+ countries, and connect your social channels — only pay for what you actually use. The best open source Skype alternative with no downloads, no SIM cards, and rates up to 90% cheaper. Self-host or use our cloud.',
  keywords: [
    // Brand
    'Phone by Ringee',
    'phone.ringee.io',
    'Ringee Phone',
    'virtual phone simplified',
    
    // Open Source
    'open source virtual phone',
    'open source Skype alternative',
    'open source VoIP phone',
    'open source calling app',
    'open source browser phone',
    'self-hosted virtual phone',
    'self-hosted VoIP',
    'open source WebRTC phone',
    'free open source phone',
    'open source telephony',
    'open source twilio alternative',
    'open source communication app',
    'transparent VoIP platform',
    
    // Primary Features
    'virtual phone number',
    'virtual number',
    'online phone number',
    'second phone number',
    'temporary phone number',
    'international phone number',
    'simple virtual phone',
    
    // Value Proposition - Pay As You Go
    'pay as you go phone',
    'pay per use phone',
    'no monthly fee phone',
    'prepaid virtual number',
    'only pay for what you use',
    'affordable virtual phone',
    
    // Social Channels Integration
    'connect social channels',
    'WhatsApp integration',
    'social media phone',
    'multi-channel communication',
    'unified communications',
    'omnichannel phone',
    
    // Skype Alternative
    'Skype alternative',
    'alternative to Skype',
    'better than Skype',
    'Skype replacement',
    'free Skype alternative',
    'Skype alternative 2024',
    'Skype alternative 2025',
    'Skype alternative 2026',
    
    // Browser Calling
    'call from browser',
    'browser phone',
    'web phone',
    'online calls',
    'make calls online',
    'receive calls online',
    'browser calling app',
    'WebRTC phone',
    
    // International
    'international calls',
    'cheap international calls',
    'call abroad',
    'call overseas',
    'international calling app',
    'global calling',
    
    // Use Cases
    'business phone number',
    'US phone number',
    'UK phone number',
    'Canada phone number',
    'buy phone number online',
    'virtual landline',
    'VoIP phone',
    'cloud phone',
    
    // Features
    'call recording',
    'voicemail',
    'caller ID',
    'incoming calls',
    'outgoing calls'
  ],
  authors: [{ name: 'Ringee.io', url: 'https://phone.ringee.io' }],
  metadataBase: new URL('https://phone.ringee.io'),
  alternates: {
    canonical: 'https://phone.ringee.io'
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://phone.ringee.io',
    title: 'Your Open Source Virtual Phone — Only Pay for What You Use | Ringee.io',
    description:
      'The open source virtual phone. Make calls, get numbers in 100+ countries, and connect your social channels — only pay for what you actually use. The best open source Skype alternative. Self-host or use our cloud.',
    siteName: 'Phone by Ringee.io',
    images: [
      {
        url: 'https://phone.ringee.io/og-image.webp',
        width: 1200,
        height: 630,
        alt: 'Ringee.io — Your Open Source Virtual Phone, Simplified'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    site: '@ringeeio',
    creator: '@ringeeio',
    title: 'Your Open Source Virtual Phone — Skype Alternative | Ringee.io',
    description:
      'The open source virtual phone. Make calls, get numbers, connect social channels — only pay for what you use. The best open source Skype alternative. Self-host or use our cloud. No downloads needed.',
    images: ['https://phone.ringee.io/og-image.webp']
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
  category: 'communication',
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
        <meta name='application-name' content='Phone by Ringee' />
        <meta name='apple-mobile-web-app-title' content='Phone by Ringee' />

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
              name: 'Phone by Ringee.io',
              applicationCategory: 'CommunicationApplication',
              operatingSystem: 'Web, iOS, Android',
              url: 'https://phone.ringee.io',
              description:
                'Your open source virtual phone, simplified. Make calls, get numbers in 100+ countries, and connect your social channels — only pay for what you actually use. The best open source Skype alternative. Self-host or use our cloud.',
              isAccessibleForFree: true,
              license: 'https://opensource.org/licenses/MIT',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  priceCurrency: 'USD',
                  price: '0',
                  billingIncrement: 'per minute',
                  description: 'Pay only for what you use - no monthly fees'
                }
              },
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: '4.9',
                reviewCount: '520'
              },
              featureList: [
                'Open source virtual phone',
                'Self-host or use our cloud',
                'Your virtual phone, simplified',
                'Pay only for what you actually use',
                'Virtual phone numbers in 100+ countries',
                'Connect your social channels (WhatsApp, Instagram, etc.)',
                'Make and receive international calls',
                'Make calls to 180+ countries',
                'Browser-based calling - no downloads needed',
                'The best open source Skype alternative',
                'Call recording',
                'Voicemail',
                'Contact management',
                'Rates up to 90% cheaper than traditional carriers'
              ],
              publisher: {
                '@type': 'Organization',
                name: 'Ringee.io',
                url: 'https://phone.ringee.io'
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
              name: 'Phone by Ringee.io',
              url: 'https://phone.ringee.io',
              logo: 'https://phone.ringee.io/android-chrome-512x512.png',
              sameAs: [
                'https://x.com/ringeeio',
                'https://www.linkedin.com/company/ringee-io',
                'https://github.com/ringee-co'
              ],
              contactPoint: {
                '@type': 'ContactPoint',
                telephone: '+18094055531',
                contactType: 'customer support',
                availableLanguage: ['English', 'Spanish']
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
          'bg-background overscroll-none font-sans antialiased',
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
              <B2CLayout showFooter>
              {children}
              </B2CLayout>
            </Providers>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
