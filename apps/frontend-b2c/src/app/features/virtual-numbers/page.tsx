import { generateSEOMetadata } from '@/lib/seo-utils';
import { productSchema, breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, ArrowRight, Globe, MapPin, Building } from 'lucide-react';
import { IconPhoneCalling } from '@tabler/icons-react';

export const metadata = generateSEOMetadata({
  title: 'Virtual Phone Numbers in 100+ Countries',
  description:
    'Get virtual phone numbers from over 100 countries. Local, toll-free, and mobile numbers with instant activation. Establish local presence anywhere in the world.',
  canonical: '/features/virtual-numbers',
  keywords: [
    'virtual phone numbers',
    'buy virtual number',
    'online phone numbers',
    'international phone numbers',
    'local phone numbers',
    'toll-free numbers',
    'virtual number provider'
  ]
});

const numberTypes = [
  {
    icon: MapPin,
    title: 'Local Numbers',
    description:
      'Get local numbers in major cities worldwide. Your callers see a familiar area code.'
  },
  {
    icon: Building,
    title: 'Toll-Free Numbers',
    description:
      'Provide free calling for your customers with professional toll-free numbers.'
  },
  {
    icon: Globe,
    title: 'Mobile Numbers',
    description:
      'Virtual mobile numbers that work just like regular cell phone numbers.'
  }
];

const countries = [
  'United States',
  'United Kingdom',
  'Canada',
  'Germany',
  'France',
  'Spain',
  'Italy',
  'Netherlands',
  'Australia',
  'Japan',
  'Brazil',
  'Mexico'
];

const benefits = [
  'Instant activation — start receiving calls in minutes',
  'No hardware or SIM cards required',
  'Manage multiple numbers from one dashboard',
  'Forward calls to any device or voicemail',
  'Keep your personal number private'
];

export default function VirtualNumbersPage() {
  return (
    <>
      {/* Schema.org markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            productSchema({
              name: 'Virtual Phone Numbers by Phone by Ringee.io',
              description:
                'Virtual phone numbers in 100+ countries with instant activation.',
              price: '1.90',
              priceCurrency: 'USD'
            })
          )
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Features', url: '/features' },
              { name: 'Virtual Numbers', url: '/features/virtual-numbers' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/features" className="hover:text-primary">
            Features
          </Link>
          <span className="mx-2">/</span>
          <span>Virtual Numbers</span>
        </nav>

        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <IconPhoneCalling className="h-4 w-4" />
            Feature
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Virtual Phone Numbers in 100+ Countries
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Establish local presence anywhere in the world. Get virtual numbers
            with instant activation — no hardware, no contracts, just
            professional phone numbers.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/buy-numbers">
              <Button size="lg" className="gap-2">
                <Phone className="h-4 w-4" />
                Browse Available Numbers
              </Button>
            </Link>
            <Link href="/rate">
              <Button size="lg" variant="outline" className="gap-2">
                View Pricing
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Number Types */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">
            Types of Numbers Available
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {numberTypes.map((type) => (
              <div key={type.title} className="bg-card border rounded-xl p-6 text-center">
                <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <type.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{type.title}</h3>
                <p className="text-muted-foreground">{type.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Countries */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">
            Popular Countries
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {countries.map((country) => (
              <div
                key={country}
                className="bg-card border rounded-lg px-4 py-3 text-center text-sm font-medium"
              >
                {country}
              </div>
            ))}
          </div>
          <p className="text-center text-muted-foreground mt-6">
            And 90+ more countries available.{' '}
            <Link href="/buy-numbers" className="text-primary hover:underline">
              Browse all →
            </Link>
          </p>
        </div>

        {/* Benefits */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            Benefits of Virtual Numbers
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="flex items-center gap-3 bg-card border rounded-lg p-4"
              >
                <div className="bg-green-500/10 p-1 rounded-full shrink-0">
                  <Check className="h-4 w-4 text-green-500" />
                </div>
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Get your virtual number today
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Numbers starting at $1.90/month. Instant activation, no contracts.
          </p>
          <Link href="/buy-numbers">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Browse Numbers
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
