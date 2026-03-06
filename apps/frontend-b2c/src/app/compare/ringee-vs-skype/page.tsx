import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, X } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Ringee vs Skype - Detailed Comparison (2026)',
  description:
    'Compare Phone by Ringee.io vs Skype for international calling. See feature differences, pricing comparison, and which is better for your needs.',
  canonical: '/compare/ringee-vs-skype',
  keywords: [
    'Ringee vs Skype',
    'Skype alternative',
    'better than Skype',
    'Skype replacement',
    'Skype competitor'
  ]
});

const features = [
  { name: 'Browser-based calling', ringee: true, skype: true },
  { name: 'Mobile app', ringee: true, skype: true },
  { name: 'Virtual phone numbers', ringee: true, skype: true },
  { name: 'Call recording', ringee: true, skype: true },
  { name: 'No account required on receiver end', ringee: true, skype: false },
  { name: 'Pay-as-you-go only', ringee: true, skype: false },
  { name: 'No subscription required', ringee: true, skype: false },
  { name: 'Instant number activation', ringee: true, skype: false },
  { name: 'Contact management', ringee: true, skype: true },
  { name: 'Call to regular phones', ringee: true, skype: true }
];

export default function RingeeVsSkypePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Comparisons', url: '/compare' },
              { name: 'Ringee vs Skype', url: '/compare/ringee-vs-skype' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/compare" className="hover:text-primary">Comparisons</Link>
          <span className="mx-2">/</span>
          <span>Ringee vs Skype</span>
        </nav>

        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Phone by Ringee.io vs Skype
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Both let you call phones from your browser, but they work differently.
            Here's a detailed breakdown to help you decide.
          </p>
        </div>

        {/* Quick Summary */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4 text-primary">Phone by Ringee.io</h2>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Pay-as-you-go, no subscriptions
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Instant virtual number activation
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Call anyone, no app needed on their end
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Modern, simple interface
              </li>
            </ul>
          </div>
          <div className="bg-card border rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4">Skype</h2>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Established brand, widely known
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Free Skype-to-Skype calls
              </li>
              <li className="flex items-center gap-2">
                <X className="h-4 w-4 text-red-500" />
                Requires Skype credit or subscription
              </li>
              <li className="flex items-center gap-2">
                <X className="h-4 w-4 text-red-500" />
                More complex feature set
              </li>
            </ul>
          </div>
        </div>

        {/* Feature Table */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-8">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-4 text-left border-b">Feature</th>
                  <th className="p-4 text-center border-b bg-primary/5">Phone by Ringee.io</th>
                  <th className="p-4 text-center border-b">Skype</th>
                </tr>
              </thead>
              <tbody>
                {features.map((feature, index) => (
                  <tr key={feature.name} className={index % 2 === 0 ? '' : 'bg-muted/20'}>
                    <td className="p-4 text-sm">{feature.name}</td>
                    <td className="p-4 text-center bg-primary/5">
                      {feature.ringee ? (
                        <Check className="h-5 w-5 text-green-500 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-red-500 mx-auto" />
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {feature.skype ? (
                        <Check className="h-5 w-5 text-green-500 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-red-500 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Verdict */}
        <div className="mb-16 bg-card border rounded-xl p-8">
          <h2 className="text-2xl font-bold mb-4">The Verdict</h2>
          <p className="text-muted-foreground mb-4">
            <strong>Choose Phone by Ringee.io if:</strong> You want simple, pay-as-you-go
            calling without subscriptions. Perfect if you call regular phones and don't need
            the recipient to have any app.
          </p>
          <p className="text-muted-foreground">
            <strong>Choose Skype if:</strong> You primarily call other Skype users for free
            and already have an established Skype network.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Ready to try the Skype alternative?
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Sign up free and make a test call. See the difference for yourself.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Try a free call
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
