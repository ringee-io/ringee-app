import { generateSEOMetadata } from '@/lib/seo-utils';
import { articleSchema, breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, MapPin, Building, Smartphone } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'How to Choose a Virtual Phone Number - Complete Guide',
  description:
    'Local vs toll-free vs mobile numbers? Learn how to choose the right virtual phone number for your business or personal use.',
  canonical: '/guides/choosing-phone-number',
  keywords: [
    'choose phone number',
    'virtual number types',
    'local vs toll-free',
    'best phone number',
    'virtual number guide'
  ],
  type: 'article',
  publishedTime: '2026-01-01'
});

const numberTypes = [
  {
    icon: MapPin,
    title: 'Local Numbers',
    description: 'Numbers with a specific city or region area code.',
    pros: [
      'Familiar to local callers',
      'Higher answer rates locally',
      'Establishes local presence',
      'Usually cheapest option'
    ],
    cons: ['May seem unprofessional for national business'],
    bestFor: 'Local businesses, real estate agents, service providers'
  },
  {
    icon: Building,
    title: 'Toll-Free Numbers',
    description: 'Numbers that are free to call (e.g., 800, 888, 877).',
    pros: [
      'Free for callers',
      'Professional image',
      'Memorable vanity options',
      'Good for customer service'
    ],
    cons: ['Higher monthly cost', 'Not available in all countries'],
    bestFor: 'Customer support, national businesses, e-commerce'
  },
  {
    icon: Smartphone,
    title: 'Mobile Numbers',
    description: 'Virtual numbers that appear as mobile/cell numbers.',
    pros: [
      'More personal feel',
      'Works just like regular mobile',
      'Good for SMS (where available)',
      'Familiar format'
    ],
    cons: ['May cost more to call for your customers'],
    bestFor: 'Freelancers, personal branding, mobile-first businesses'
  }
];

export default function ChoosingPhoneNumberPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            articleSchema({
              title: 'How to Choose a Virtual Phone Number',
              description: 'Guide to selecting the right virtual number type.',
              url: '/guides/choosing-phone-number',
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
              { name: 'Choosing a Phone Number', url: '/guides/choosing-phone-number' }
            ])
          )
        }}
      />

      <article className="container mx-auto max-w-4xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/guides" className="hover:text-primary">Guides</Link>
          <span className="mx-2">/</span>
          <span>Choosing a Phone Number</span>
        </nav>

        <header className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            How to Choose the Right Virtual Phone Number
          </h1>
          <p className="text-lg text-muted-foreground">
            Local, toll-free, or mobile? Here's how to pick the number type that
            best fits your needs.
          </p>
        </header>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Types of Virtual Numbers</h2>
          <div className="space-y-8">
            {numberTypes.map((type) => (
              <div key={type.title} className="bg-card border rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-primary/10 p-2 rounded-lg">
                    <type.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">{type.title}</h3>
                </div>
                <p className="text-muted-foreground mb-4">{type.description}</p>
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="font-medium text-green-600 mb-2">Pros:</p>
                    <ul className="space-y-1 text-sm">
                      {type.pros.map((pro) => (
                        <li key={pro}>✓ {pro}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-red-600 mb-2">Cons:</p>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {type.cons.map((con) => (
                        <li key={con}>• {con}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="text-sm">
                  <strong>Best for:</strong> {type.bestFor}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Quick Decision Guide</h2>
          <div className="bg-muted/30 rounded-xl p-6">
            <ul className="space-y-3">
              <li>
                <strong>Calling mostly local customers?</strong> → Get a local number
              </li>
              <li>
                <strong>Running customer support?</strong> → Consider toll-free
              </li>
              <li>
                <strong>Want a personal touch?</strong> → Mobile number works great
              </li>
              <li>
                <strong>Serving multiple regions?</strong> → Get one number per region
              </li>
            </ul>
          </div>
        </section>

        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-4">Browse available numbers</h2>
          <p className="text-muted-foreground mb-6">
            See what's available in your target countries and cities.
          </p>
          <Link href="/buy-numbers">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Browse Numbers
            </Button>
          </Link>
        </div>
      </article>
    </>
  );
}
