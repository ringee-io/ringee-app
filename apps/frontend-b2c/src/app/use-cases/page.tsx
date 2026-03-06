import { generateSEOMetadata } from '@/lib/seo-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { 
  Phone, Briefcase, Home, Users, Headphones,
  Heart, Plane, Building2, Globe
} from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Use Cases - Personal & Business Calling Solutions',
  description:
    'Discover how people use Phone by Ringee.io to call family abroad, while traveling, or for business. Solutions for personal and professional needs.',
  canonical: '/use-cases',
  keywords: [
    'VoIP use cases',
    'call family abroad',
    'business phone',
    'international calling',
    'calling solution'
  ]
});

const personalUseCases = [
  {
    icon: Heart,
    title: 'Call Family Abroad',
    description: 'Stay connected with parents, grandparents, and loved ones overseas at affordable rates.',
    href: '/use-cases/calling-family',
    features: ['90% cheaper rates', 'HD quality', 'Call any phone']
  },
  {
    icon: Plane,
    title: 'International Travelers',
    description: 'Call hotels, airlines, and banks without roaming fees. Works on any WiFi.',
    href: '/use-cases/international-travelers',
    features: ['No roaming', 'Works worldwide', 'WiFi calling']
  },
  {
    icon: Building2,
    title: 'Call Banks & Offices',
    description: 'Reach banks, government offices, and services that don\'t support WhatsApp.',
    href: '/use-cases/calling-banks-offices',
    features: ['Any phone number', 'No apps needed', 'Urgent calls']
  },
  {
    icon: Globe,
    title: 'Call Popular Countries',
    description: 'Affordable calls to Germany, Russia, Mexico, India, and 180+ countries.',
    href: '/use-cases/call-germany',
    features: ['Low rates', '180+ countries', 'Simple pricing']
  }
];

const businessUseCases = [
  {
    icon: Briefcase,
    title: 'For Freelancers',
    description: 'Separate business from personal. Get a professional number and keep your privacy.',
    href: '/use-cases/freelancers',
    features: ['Dedicated number', 'Pay-as-you-go', 'Privacy']
  },
  {
    icon: Users,
    title: 'For Sales Teams',
    description: 'Make more calls, close more deals. Built-in recording for training.',
    href: '/use-cases/sales-teams',
    features: ['Recording', 'Analytics', 'Local presence']
  },
  {
    icon: Home,
    title: 'For Real Estate',
    description: 'Local presence in multiple markets. Never miss a lead.',
    href: '/use-cases/real-estate',
    features: ['Local numbers', 'Forwarding', 'Voicemail']
  },
  {
    icon: Headphones,
    title: 'For Call Centers',
    description: 'Affordable solution for small teams. No expensive hardware.',
    href: '/use-cases/small-call-centers',
    features: ['Low rates', 'No contracts', 'Browser-based']
  }
];

export default function UseCasesPage() {
  return (
    <div className="container mx-auto max-w-7xl py-20 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
          How Will You Use Ringee?
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
          Whether you're calling family abroad or building a business, 
          we have a solution for you.
        </p>
      </div>

      {/* Personal Use Section */}
      <section className="mb-20">
        <div className="flex items-center gap-3 mb-8">
          <Heart className="h-6 w-6 text-primary" />
          <h2 className="text-2xl md:text-3xl font-bold">Personal Use</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {personalUseCases.map((useCase) => (
            <Link
              key={useCase.title}
              href={useCase.href}
              className="group bg-card border rounded-xl p-6 hover:border-primary/50 hover:shadow-lg transition-all flex flex-col"
            >
              <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <useCase.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                {useCase.title}
              </h3>
              <p className="text-muted-foreground text-sm mb-4 flex-1">{useCase.description}</p>
              <div className="flex flex-wrap gap-2">
                {useCase.features.map((feature) => (
                  <span
                    key={feature}
                    className="text-xs bg-primary/5 text-primary px-2 py-1 rounded"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
        <div className="text-center">
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Start calling for personal use
            </Button>
          </Link>
        </div>
      </section>

      {/* Business Use Section */}
      <section className="mb-16">
        <div className="flex items-center gap-3 mb-8">
          <Briefcase className="h-6 w-6 text-primary" />
          <h2 className="text-2xl md:text-3xl font-bold">For Business</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {businessUseCases.map((useCase) => (
            <Link
              key={useCase.title}
              href={useCase.href}
              className="group bg-card border rounded-xl p-6 hover:border-primary/50 hover:shadow-lg transition-all flex flex-col"
            >
              <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <useCase.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                {useCase.title}
              </h3>
              <p className="text-muted-foreground text-sm mb-4 flex-1">{useCase.description}</p>
              <div className="flex flex-wrap gap-2">
                {useCase.features.map((feature) => (
                  <span
                    key={feature}
                    className="text-xs bg-primary/5 text-primary px-2 py-1 rounded"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
        <div className="text-center">
          <a href="https://www.ringee.io" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="gap-2">
              <Briefcase className="h-4 w-4" />
              Get Ringee for Teams
            </Button>
          </a>
        </div>
      </section>

      {/* Country-specific section */}
      <section className="mb-16 bg-card border rounded-2xl p-8">
        <h2 className="text-2xl font-bold mb-6 text-center">Popular Calling Destinations</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { name: 'Germany', flag: '🇩🇪', href: '/use-cases/call-germany' },
            { name: 'Russia', flag: '🇷🇺', href: '/use-cases/call-russia' },
            { name: 'Mexico', flag: '🇲🇽', href: '/use-cases/call-mexico' },
            { name: 'India', flag: '🇮🇳', href: '/use-cases/call-india' }
          ].map((country) => (
            <Link
              key={country.name}
              href={country.href}
              className="flex items-center justify-center gap-2 bg-muted/50 hover:bg-primary/10 rounded-lg px-4 py-3 font-medium transition-colors"
            >
              <span className="text-lg">{country.flag}</span>
              {country.name}
            </Link>
          ))}
        </div>
        <p className="text-center text-muted-foreground">
          <Link href="/rate" className="text-primary hover:underline">See rates for all 180+ countries →</Link>
        </p>
      </section>
    </div>
  );
}
