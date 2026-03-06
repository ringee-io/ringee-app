import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, Building2, Landmark, CreditCard, FileText } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Call Banks & Government Offices Abroad',
  description:
    'Need to call your bank, government offices, or utilities in another country? Make affordable calls to offices that don\'t support WhatsApp or email.',
  canonical: '/use-cases/calling-banks-offices',
  keywords: [
    'call bank abroad',
    'call government office',
    'international bank call',
    'call utilities abroad',
    'call insurance company abroad'
  ]
});

const useCases = [
  {
    icon: CreditCard,
    title: 'Banks & Credit Cards',
    description: 'Report lost cards, dispute charges, or manage your accounts from abroad.'
  },
  {
    icon: Landmark,
    title: 'Government Offices',
    description: 'Immigration, tax offices, social security — reach them directly.'
  },
  {
    icon: FileText,
    title: 'Insurance Companies',
    description: 'File claims, check coverage, or get emergency assistance.'
  },
  {
    icon: Building2,
    title: 'Utilities & Services',
    description: 'Manage bills, report issues, or cancel services while away.'
  }
];

const scenarios = [
  'You\'re abroad and need to report a lost credit card immediately',
  'Your visa documents need clarification from the immigration office',
  'You need to update your address with your bank before moving',
  'Insurance claim requires a phone call — email won\'t work',
  'Tax office only accepts phone appointments',
  'Utility company needs verbal authorization to cancel service'
];

export default function CallingBanksOfficesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Use Cases', url: '/use-cases' },
              { name: 'Calling Banks & Offices', url: '/use-cases/calling-banks-offices' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/use-cases" className="hover:text-primary">Use Cases</Link>
          <span className="mx-2">/</span>
          <span>Calling Banks & Offices</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <Building2 className="h-4 w-4" />
            Personal Use
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Call Banks & Government Offices
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Some things can only be resolved by phone. Call banks, government offices, 
            insurance companies, and utilities in any country at affordable rates.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Get started now
            </Button>
          </Link>
        </div>

        {/* Use cases */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {useCases.map((useCase) => (
            <div key={useCase.title} className="bg-card border rounded-xl p-6 text-center">
              <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4">
                <useCase.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">{useCase.title}</h3>
              <p className="text-sm text-muted-foreground">{useCase.description}</p>
            </div>
          ))}
        </div>

        {/* When you need it */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">When You'll Need This</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {scenarios.map((scenario, index) => (
              <div key={index} className="flex items-start gap-3 bg-card border rounded-lg p-4">
                <div className="bg-primary/10 p-1 rounded-full shrink-0 mt-0.5">
                  <Check className="h-4 w-4 text-primary" />
                </div>
                <span>{scenario}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Why phone calls matter */}
        <div className="mb-20 bg-card border rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-4 text-center">Why Phone Calls Still Matter</h2>
          <p className="text-muted-foreground text-center max-w-3xl mx-auto">
            Many institutions don't support WhatsApp, email isn't fast enough for urgent matters, 
            and online chat can't handle complex issues. A direct phone call is often the only way 
            to resolve important business quickly.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Be ready when you need to call
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Set up your account now so you're prepared when an urgent call is needed.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Create your account
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
