import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, Laptop, Wifi, Globe, Shield } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Phone Solution for Remote Workers',
  description:
    'Stay connected while working from anywhere. Professional phone system that works from your browser. No office required.',
  canonical: '/use-cases/remote-workers',
  keywords: [
    'remote work phone',
    'work from home phone',
    'remote calling solution',
    'distributed team phone',
    'virtual office phone'
  ]
});

const features = [
  {
    icon: Laptop,
    title: 'Work From Anywhere',
    description: 'Your phone system follows you. Call from any device with a browser.'
  },
  {
    icon: Wifi,
    title: 'No Office Needed',
    description: 'No physical PBX or desk phones. Just your laptop and internet.'
  },
  {
    icon: Shield,
    title: 'Professional Image',
    description: 'Business number keeps work and personal life separate.'
  }
];

const benefits = [
  'Call from laptop, tablet, or phone',
  'Keep personal number private',
  'Same number, any location',
  'HD audio quality over WiFi',
  'Sync across all devices',
  'No office infrastructure needed'
];

export default function RemoteWorkersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Use Cases', url: '/use-cases' },
              { name: 'For Remote Workers', url: '/use-cases/remote-workers' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/use-cases" className="hover:text-primary">Use Cases</Link>
          <span className="mx-2">/</span>
          <span>For Remote Workers</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <Laptop className="h-4 w-4" />
            Use Case
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Your Office Phone, Everywhere You Go
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Work from home, a coffee shop, or another country. Your professional
            phone system works wherever you have internet.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Start working remotely
            </Button>
          </Link>
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
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Perfect for Remote Life</h2>
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
            Take your phone system anywhere
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Set up in seconds. Call from anywhere with just a browser.
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
