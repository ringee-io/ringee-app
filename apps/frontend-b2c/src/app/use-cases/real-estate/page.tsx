import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, Home, MapPin, Clock, PhoneForwarded } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Phone Solution for Real Estate Agents',
  description:
    'Never miss a lead. Get local numbers in multiple markets, call forwarding, and voicemail. Perfect for real estate agents and brokers.',
  canonical: '/use-cases/real-estate',
  keywords: [
    'phone for real estate',
    'real estate calling',
    'agent phone system',
    'realtor phone number',
    'real estate virtual number'
  ]
});

const features = [
  {
    icon: MapPin,
    title: 'Local Presence',
    description: 'Get local numbers in every market you serve. Buyers see a familiar area code.'
  },
  {
    icon: PhoneForwarded,
    title: 'Call Forwarding',
    description: 'Forward calls to your cell, office, or colleague. Never miss a lead.'
  },
  {
    icon: Clock,
    title: 'After-Hours Voicemail',
    description: 'Professional voicemail captures leads even when you\'re unavailable.'
  }
];

const benefits = [
  'Local numbers for every market you work',
  'Forward calls to any device',
  'Record calls for contract discussions',
  'Separate work from personal calls',
  'Affordable international calling for investors',
  'Works from your browser or phone'
];

export default function RealEstatePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Use Cases', url: '/use-cases' },
              { name: 'For Real Estate', url: '/use-cases/real-estate' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/use-cases" className="hover:text-primary">Use Cases</Link>
          <span className="mx-2">/</span>
          <span>For Real Estate</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <Home className="h-4 w-4" />
            Use Case
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Never Miss a Lead Again
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Get local numbers in every market you serve. Set up call forwarding
            so you're always reachable. Professional voicemail when you can't answer.
          </p>
          <a href="https://www.ringee.io" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Get your business number
            </Button>
          </a>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-20">
          {features.map((feature) => (
            <div key={feature.title} className="bg-card border rounded-xl p-6 text-center">
              <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Built for Real Estate Pros</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-center gap-3 bg-card border rounded-lg p-4">
                <div className="bg-green-500/10 p-1 rounded-full shrink-0">
                  <Check className="h-4 w-4 text-green-500" />
                </div>
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Capture every opportunity
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Set up your business number in minutes. No contracts, affordable rates.
          </p>
          <a href="https://www.ringee.io/sign-up" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Get started with Ringee
            </Button>
          </a>
        </div>
      </div>
    </>
  );
}
