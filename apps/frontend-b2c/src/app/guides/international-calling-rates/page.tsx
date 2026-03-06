import { generateSEOMetadata } from '@/lib/seo-utils';
import { articleSchema, breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, DollarSign, Globe, TrendingDown } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'International Calling Rates Explained - How to Save Money',
  description:
    'Understand how international calling rates work and learn strategies to save money on overseas phone calls. Compare VoIP vs traditional carriers.',
  canonical: '/guides/international-calling-rates',
  keywords: [
    'international calling rates',
    'cheap international calls',
    'overseas calling costs',
    'VoIP international rates',
    'save money on calls'
  ],
  type: 'article',
  publishedTime: '2026-01-01'
});

const savingTips = [
  {
    icon: Globe,
    title: 'Use VoIP Services',
    description:
      'VoIP services like Phone by Ringee.io route calls over the internet, bypassing expensive carrier networks.'
  },
  {
    icon: TrendingDown,
    title: 'Compare Rates',
    description:
      'Rates vary significantly by destination. Always check rates before making long calls.'
  },
  {
    icon: DollarSign,
    title: 'Pay-as-you-go',
    description:
      'Avoid subscriptions if you don\'t call often. Pay only for minutes used.'
  }
];

const rateFactors = [
  {
    factor: 'Destination Country',
    explanation:
      'Calls to developed countries are usually cheaper than developing countries due to infrastructure differences.'
  },
  {
    factor: 'Mobile vs Landline',
    explanation:
      'Calls to mobile phones typically cost more than landlines in most countries.'
  },
  {
    factor: 'Time of Call',
    explanation:
      'Some providers offer off-peak rates. VoIP rates are usually consistent 24/7.'
  },
  {
    factor: 'Provider',
    explanation:
      'Traditional carriers charge premium rates. VoIP providers are typically 50-90% cheaper.'
  }
];

export default function InternationalCallingRatesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            articleSchema({
              title: 'International Calling Rates Explained',
              description: 'How to understand and save on international calling.',
              url: '/guides/international-calling-rates',
              publishedDate: '2026-01-01'
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
              { name: 'Guides', url: '/guides' },
              { name: 'International Calling Rates', url: '/guides/international-calling-rates' }
            ])
          )
        }}
      />

      <article className="container mx-auto max-w-3xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/guides" className="hover:text-primary">Guides</Link>
          <span className="mx-2">/</span>
          <span>International Calling Rates</span>
        </nav>

        <header className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            International Calling Rates Explained
          </h1>
          <p className="text-lg text-muted-foreground">
            Learn what affects international calling costs and how to save up to
            90% on overseas phone calls.
          </p>
        </header>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">What Affects Rates?</h2>
          <div className="space-y-4">
            {rateFactors.map((item) => (
              <div key={item.factor} className="bg-card border rounded-lg p-4">
                <h3 className="font-semibold mb-1">{item.factor}</h3>
                <p className="text-sm text-muted-foreground">{item.explanation}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">How to Save Money</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {savingTips.map((tip) => (
              <div key={tip.title} className="bg-card border rounded-lg p-4 text-center">
                <tip.icon className="h-8 w-8 mx-auto mb-3 text-primary" />
                <h3 className="font-medium mb-2">{tip.title}</h3>
                <p className="text-sm text-muted-foreground">{tip.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12 bg-primary/5 border border-primary/10 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4">VoIP vs Traditional Carriers</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Destination Example</th>
                  <th className="text-right py-2">Traditional Carrier</th>
                  <th className="text-right py-2 text-primary">VoIP (Ringee)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2">US → UK Mobile</td>
                  <td className="text-right text-muted-foreground">~$0.30/min</td>
                  <td className="text-right text-primary font-medium">~$0.02/min</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">US → India Mobile</td>
                  <td className="text-right text-muted-foreground">~$0.50/min</td>
                  <td className="text-right text-primary font-medium">~$0.03/min</td>
                </tr>
                <tr>
                  <td className="py-2">US → Mexico Mobile</td>
                  <td className="text-right text-muted-foreground">~$0.25/min</td>
                  <td className="text-right text-primary font-medium">~$0.02/min</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            * Example rates. Actual rates vary by provider and may change.
          </p>
        </section>

        <div className="text-center bg-card border rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-4">Check our rates</h2>
          <p className="text-muted-foreground mb-6">
            See exactly what you'll pay before you call.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/rate">
              <Button size="lg" variant="outline">
                View All Rates
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="lg" className="gap-2">
                <Phone className="h-4 w-4" />
                Try a free call
              </Button>
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
