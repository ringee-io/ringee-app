import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, Users, BarChart3, Headphones, Target } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Phone Solution for Sales Teams - Close More Deals',
  description:
    'Empower your sales team with call recording, analytics, and affordable international calling. Make more calls, train better, and close more deals.',
  canonical: '/use-cases/sales-teams',
  keywords: [
    'sales calling software',
    'phone for sales teams',
    'outbound calling tool',
    'sales dialer',
    'cold calling software'
  ]
});

const features = [
  {
    icon: Headphones,
    title: 'Call Recording',
    description: 'Record calls for training and quality assurance. Review what works.'
  },
  {
    icon: BarChart3,
    title: 'Call Analytics',
    description: 'Track call volume, duration, and outcomes across your team.'
  },
  {
    icon: Target,
    title: 'Local Presence',
    description: 'Display local caller ID to improve answer rates.'
  }
];

const benefits = [
  'Improve answer rates with local caller ID',
  'Train reps with recorded call examples',
  'Track team performance with analytics',
  'No per-seat fees — pay for usage only',
  'Works in any browser, no installations',
  'Call prospects in 180+ countries'
];

export default function SalesTeamsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Use Cases', url: '/use-cases' },
              { name: 'For Sales Teams', url: '/use-cases/sales-teams' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/use-cases" className="hover:text-primary">Use Cases</Link>
          <span className="mx-2">/</span>
          <span>For Sales Teams</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <Users className="h-4 w-4" />
            Use Case
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Make More Calls, Close More Deals
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Equip your sales team with the tools they need. Call recording for
            training, local caller ID for better answer rates, and analytics to
            track performance.
          </p>
          <a href="https://www.ringee.io" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Empower your team
            </Button>
          </a>
        </div>

        {/* Features */}
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

        {/* Benefits */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Built for Sales Success</h2>
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

        {/* CTA */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Give your sales team the edge
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Start making calls in minutes. No complex setup, no per-seat fees.
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
