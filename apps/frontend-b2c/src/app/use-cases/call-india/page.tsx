import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, MapPin } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Call India - Cheap Calls to Indian Landlines & Mobiles',
  description:
    'Call India affordably from anywhere. Low rates to Indian landlines and mobiles (Jio, Airtel, Vi). Stay connected with family across India.',
  canonical: '/use-cases/call-india',
  keywords: [
    'call India',
    'cheap calls to India',
    'India calling rates',
    'call Airtel Jio from abroad',
    'phone India from USA',
    'call Indian number'
  ]
});

const benefits = [
  'Low rates to Jio, Airtel, Vi, and landlines',
  'Crystal clear HD quality calls',
  'Call from any browser or device',
  'No app needed on their end',
  'Pay-as-you-go, no subscription',
  'Works worldwide 24/7'
];

const commonReasons = [
  'Calling parents and grandparents in India',
  'Staying in touch with extended family',
  'Reaching Indian banks (SBI, HDFC, ICICI)',
  'Contacting government offices and services',
  'Business calls to Indian companies',
  'Making appointments and reservations'
];

export default function CallIndiaPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Use Cases', url: '/use-cases' },
              { name: 'Call India', url: '/use-cases/call-india' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/use-cases" className="hover:text-primary">Use Cases</Link>
          <span className="mx-2">/</span>
          <span>Call India</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <MapPin className="h-4 w-4" />
            🇮🇳 India
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Call India Affordably
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Stay connected with family across India. Call any Indian landline 
            or mobile — Jio, Airtel, Vi — at low rates.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="gap-2">
                <Phone className="h-4 w-4" />
                Start calling India
              </Button>
            </Link>
            <Link href="/rate">
              <Button size="lg" variant="outline">
                Check India rates
              </Button>
            </Link>
          </div>
        </div>

        {/* Why call India */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Common Reasons to Call India</h2>
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
          <h2 className="text-2xl font-bold mb-6 text-center">Why Choose Ringee for India Calls</h2>
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
            Call India Today
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Sign up and start calling in minutes. Stay connected with loved ones in India.
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
