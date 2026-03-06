import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, Plane, Hotel, Building2, Landmark } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'International Travelers - Call Hotels, Banks & Embassies Abroad',
  description:
    'Traveling abroad? Call hotels, airlines, banks, and embassies without expensive roaming fees. Works from any browser, anywhere in the world.',
  canonical: '/use-cases/international-travelers',
  keywords: [
    'call hotels abroad',
    'international travel calling',
    'avoid roaming fees',
    'call embassy',
    'travel phone app',
    'call airlines internationally'
  ]
});

const useCases = [
  {
    icon: Hotel,
    title: 'Hotels & Restaurants',
    description: 'Make reservations, confirm bookings, or request special accommodations.'
  },
  {
    icon: Plane,
    title: 'Airlines & Transport',
    description: 'Change flights, confirm bookings, or resolve travel issues directly.'
  },
  {
    icon: Building2,
    title: 'Banks & Financial',
    description: 'Contact your bank, report issues, or manage finances while abroad.'
  },
  {
    icon: Landmark,
    title: 'Embassies & Government',
    description: 'Reach consulates, embassies, and government offices for urgent matters.'
  }
];

const benefits = [
  'No roaming fees — calls go over WiFi',
  'Works from any browser with internet',
  'Call landlines without apps on their end',
  'Crystal clear quality worldwide',
  'Pay only for minutes used',
  'Add credit anytime from anywhere'
];

export default function InternationalTravelersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Use Cases', url: '/use-cases' },
              { name: 'International Travelers', url: '/use-cases/international-travelers' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/use-cases" className="hover:text-primary">Use Cases</Link>
          <span className="mx-2">/</span>
          <span>International Travelers</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <Plane className="h-4 w-4" />
            Personal Use
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Stay Connected While Traveling
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Call hotels, airlines, banks, and embassies from anywhere in the world.
            No roaming fees — just connect to WiFi and call.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Get started before your trip
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

        {/* How it works for travelers */}
        <div className="mb-20 bg-card border rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-6 text-center">How It Works for Travelers</h2>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="bg-primary text-primary-foreground w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4 font-bold">1</div>
              <h3 className="font-semibold mb-2">Sign Up Before You Go</h3>
              <p className="text-sm text-muted-foreground">Create your account and add credit before your trip.</p>
            </div>
            <div>
              <div className="bg-primary text-primary-foreground w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4 font-bold">2</div>
              <h3 className="font-semibold mb-2">Connect to WiFi</h3>
              <p className="text-sm text-muted-foreground">Hotel, cafe, airport — any WiFi connection works.</p>
            </div>
            <div>
              <div className="bg-primary text-primary-foreground w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4 font-bold">3</div>
              <h3 className="font-semibold mb-2">Call Any Number</h3>
              <p className="text-sm text-muted-foreground">Dial the local number and you're connected instantly.</p>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Why Travelers Love Ringee</h2>
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
            Prepare for your next trip
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Sign up now and be ready to call from anywhere. Add credit in minutes.
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
