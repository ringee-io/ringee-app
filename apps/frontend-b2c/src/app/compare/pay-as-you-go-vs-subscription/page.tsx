import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, DollarSign, CreditCard } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Pay-as-you-go vs Subscription - VoIP Pricing Comparison',
  description:
    'Should you pay per minute or subscribe monthly? Compare pay-as-you-go vs subscription pricing for VoIP and calling services.',
  canonical: '/compare/pay-as-you-go-vs-subscription',
  keywords: [
    'pay as you go VoIP',
    'VoIP subscription',
    'calling plan comparison',
    'VoIP pricing models',
    'pay per minute calling'
  ]
});

export default function PayAsYouGoVsSubscriptionPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Comparisons', url: '/compare' },
              { name: 'Pay-as-you-go vs Subscription', url: '/compare/pay-as-you-go-vs-subscription' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/compare" className="hover:text-primary">Comparisons</Link>
          <span className="mx-2">/</span>
          <span>Pay-as-you-go vs Subscription</span>
        </nav>

        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Pay-as-you-go vs Subscription: Which Saves More?
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Different pricing models work for different calling patterns.
            Here's how to choose the right one.
          </p>
        </div>

        {/* Comparison */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-primary/20 p-2 rounded-lg">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-bold">Pay-as-you-go</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Pay only for the minutes you use. No monthly commitment.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                No monthly fees
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Perfect for variable usage
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                No unused minutes wasted
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Cancel anytime (nothing to cancel)
              </li>
            </ul>
            <div className="mt-4 p-3 bg-primary/10 rounded-lg text-sm">
              <strong>Best for:</strong> Variable call volume, occasional users, testing
            </div>
          </div>

          <div className="bg-card border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-muted p-2 rounded-lg">
                <CreditCard className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold">Subscription</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Fixed monthly fee for a bundle of minutes or unlimited calls.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Predictable monthly cost
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                May include unlimited to some destinations
              </li>
              <li className="flex items-center gap-2">
                <span className="text-muted-foreground">Pay even if you don't call</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-muted-foreground">May require annual commitment</span>
              </li>
            </ul>
            <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm">
              <strong>Best for:</strong> High-volume callers to specific destinations
            </div>
          </div>
        </div>

        {/* Verdict */}
        <div className="mb-16 bg-card border rounded-xl p-8">
          <h2 className="text-2xl font-bold mb-4">Bottom Line</h2>
          <p className="text-muted-foreground mb-4">
            <strong>Choose pay-as-you-go if:</strong> Your calling volume varies month to month, 
            you're just getting started, or you call many different destinations.
          </p>
          <p className="text-muted-foreground">
            <strong>Choose subscription if:</strong> You make a lot of calls to the same country 
            every month and want unlimited calling to that destination.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Phone by Ringee.io uses pay-as-you-go
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            No subscriptions, no commitments. Pay only for what you use at transparent rates.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="gap-2">
                <Phone className="h-4 w-4" />
                Try a free call
              </Button>
            </Link>
            <Link href="/rate">
              <Button size="lg" variant="outline">
                See our rates
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
