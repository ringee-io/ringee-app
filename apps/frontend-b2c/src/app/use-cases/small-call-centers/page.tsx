import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, Headphones, DollarSign, Globe, Users } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Affordable Phone Solution for Small Call Centers',
  description:
    'No expensive hardware, no per-seat fees. Get your small call center up and running with browser-based calling and affordable per-minute rates.',
  canonical: '/use-cases/small-call-centers',
  keywords: [
    'small call center software',
    'affordable call center',
    'browser-based call center',
    'VoIP call center',
    'call center solution'
  ]
});

const features = [
  {
    icon: DollarSign,
    title: 'Affordable Rates',
    description: 'Low per-minute rates, no per-seat fees. Pay only for what you use.'
  },
  {
    icon: Globe,
    title: 'Browser-Based',
    description: 'No hardware to buy. Agents just need a browser and headset.'
  },
  {
    icon: Users,
    title: 'Scale Easily',
    description: 'Add or remove agents anytime. No contracts to lock you in.'
  }
];

const benefits = [
  'No expensive PBX hardware needed',
  'Pay per minute, not per seat',
  'Call recording included',
  'Call history and analytics',
  'Local numbers in 100+ countries',
  'Quick setup — be live in minutes'
];

export default function SmallCallCentersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Use Cases', url: '/use-cases' },
              { name: 'For Small Call Centers', url: '/use-cases/small-call-centers' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/use-cases" className="hover:text-primary">Use Cases</Link>
          <span className="mx-2">/</span>
          <span>For Small Call Centers</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <Headphones className="h-4 w-4" />
            Use Case
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Enterprise Features, Startup Budget
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Run your call center without expensive hardware or per-seat fees.
            Your agents just need a browser to start making calls.
          </p>
          <a href="https://www.ringee.io" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Start your call center
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
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Why Small Teams Choose Ringee</h2>
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
            Launch your call center today
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Get started in minutes with no upfront costs or long-term contracts.
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
