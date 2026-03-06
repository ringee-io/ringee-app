import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, MapPin } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Call Mexico - Cheap Calls to Mexican Landlines & Mobiles',
  description:
    'Call Mexico affordably from the US, Canada, or anywhere. Low rates to Mexican landlines and Telcel/Movistar mobiles. Stay connected with family.',
  canonical: '/use-cases/call-mexico',
  keywords: [
    'call Mexico',
    'cheap calls to Mexico',
    'llamar a México',
    'Mexico calling rates',
    'call Telcel from abroad',
    'phone Mexico from USA'
  ]
});

const benefits = [
  'Low rates to Telcel, Movistar, and landlines',
  'Crystal clear HD quality calls',
  'Call from any browser or device',
  'No app needed on their end',
  'Pay-as-you-go, no subscription',
  'Perfect for calling from USA/Canada'
];

const commonReasons = [
  'Calling family and friends in Mexico',
  'Reaching Mexican banks (Banamex, BBVA, Santander)',
  'Contacting IMSS, SAT, and government offices',
  'Making appointments with businesses',
  'Calling hotels and travel services',
  'Staying in touch with hometown connections'
];

export default function CallMexicoPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Use Cases', url: '/use-cases' },
              { name: 'Call Mexico', url: '/use-cases/call-mexico' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/use-cases" className="hover:text-primary">Use Cases</Link>
          <span className="mx-2">/</span>
          <span>Call Mexico</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <MapPin className="h-4 w-4" />
            🇲🇽 Mexico
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Call Mexico Affordably
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Stay connected with family and friends in Mexico. Call any Mexican landline 
            or mobile at low rates from the US, Canada, or anywhere.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="gap-2">
                <Phone className="h-4 w-4" />
                Start calling Mexico
              </Button>
            </Link>
            <Link href="/rate">
              <Button size="lg" variant="outline">
                Check Mexico rates
              </Button>
            </Link>
          </div>
        </div>

        {/* Why call Mexico */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Common Reasons to Call Mexico</h2>
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
          <h2 className="text-2xl font-bold mb-6 text-center">Why Choose Ringee for Mexico Calls</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500 shrink-0" />
                <span className="text-sm">{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Call Mexico Today
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Sign up and start calling in minutes. Stay connected with loved ones in Mexico.
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
