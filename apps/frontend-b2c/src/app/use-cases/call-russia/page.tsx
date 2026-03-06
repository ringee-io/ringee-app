import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, MapPin } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Call Russia - Cheap Calls to Russian Landlines & Mobiles',
  description:
    'Call Russia affordably from anywhere in the world. Low rates to Russian landlines and mobiles. Stay connected with family and friends in Russia.',
  canonical: '/use-cases/call-russia',
  keywords: [
    'call Russia',
    'cheap calls to Russia',
    'call Russian number',
    'Russia calling rates',
    'phone Russia from abroad',
    'звонить в Россию'
  ]
});

const benefits = [
  'Low rates to Russian landlines and mobiles',
  'Crystal clear HD quality calls',
  'Call from any browser or device',
  'No app needed on their end',
  'Pay-as-you-go, no subscription',
  'Works worldwide'
];

const commonReasons = [
  'Calling parents and grandparents in Russia',
  'Staying in touch with friends and relatives',
  'Reaching Russian banks (Sberbank, VTB, etc.)',
  'Contacting government offices',
  'Calling businesses and services in Russia',
  'Making appointments with Russian organizations'
];

export default function CallRussiaPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Use Cases', url: '/use-cases' },
              { name: 'Call Russia', url: '/use-cases/call-russia' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/use-cases" className="hover:text-primary">Use Cases</Link>
          <span className="mx-2">/</span>
          <span>Call Russia</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <MapPin className="h-4 w-4" />
            🇷🇺 Russia
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Call Russia Affordably
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Stay connected with family and friends in Russia. Call landlines and mobiles
            at low rates from anywhere in the world.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="gap-2">
                <Phone className="h-4 w-4" />
                Start calling Russia
              </Button>
            </Link>
            <Link href="/rate">
              <Button size="lg" variant="outline">
                Check Russia rates
              </Button>
            </Link>
          </div>
        </div>

        {/* Why call Russia */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Common Reasons to Call Russia</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {commonReasons.map((reason, index) => (
              <div key={index} className="flex items-center gap-3 bg-card border rounded-lg p-4">
                <div className="bg-primary/10 p-1 rounded-full shrink-0">
                  <Check className="h-4 w-4 text-primary" />
                </div>
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Benefits */}
        <div className="mb-20 bg-card border rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-6 text-center">Why Choose Ringee for Russia Calls</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500 shrink-0" />
                <span className="text-sm">{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="mb-20 bg-muted/30 rounded-xl p-6 text-center">
          <p className="text-muted-foreground">
            <strong>Note:</strong> Ringee works over the internet. As long as you have an internet connection,
            you can call Russia from anywhere in the world.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Call Russia Today
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Sign up and start calling in minutes. Stay connected with loved ones in Russia.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Get started free
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
