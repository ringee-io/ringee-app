import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, Heart, Globe, DollarSign } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Call Family Abroad - Affordable International Calls to Loved Ones',
  description:
    'Call your parents, grandparents, and family abroad at rates up to 90% cheaper than traditional carriers. Crystal clear quality from your browser.',
  canonical: '/use-cases/calling-family',
  keywords: [
    'call family abroad',
    'cheap international calls',
    'call parents overseas',
    'call grandparents abroad',
    'international calling app',
    'call home cheap'
  ]
});

const benefits = [
  'Rates up to 90% cheaper than traditional carriers',
  'Crystal clear HD voice quality',
  'Call landlines and mobiles worldwide',
  'No app needed on their end — call any phone',
  'Works from your browser or phone',
  'Pay only for the minutes you use'
];

const testimonials = [
  {
    quote: 'I call my mom in Venezuela every Sunday. The quality is perfect and I pay a fraction of what I used to.',
    name: 'María José',
    location: 'Miami, USA'
  },
  {
    quote: 'My grandmother doesn\'t have WhatsApp, but with Ringee I can call her landline in Colombia anytime.',
    name: 'Andrea P.',
    location: 'Madrid, Spain'
  }
];

export default function CallingFamilyPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Use Cases', url: '/use-cases' },
              { name: 'Calling Family Abroad', url: '/use-cases/calling-family' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/use-cases" className="hover:text-primary">Use Cases</Link>
          <span className="mx-2">/</span>
          <span>Calling Family Abroad</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <Heart className="h-4 w-4" />
            Personal Use
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Call Your Family Abroad
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Stay connected with your parents, grandparents, and loved ones overseas.
            Crystal clear calls at rates up to 90% cheaper than traditional carriers.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Try a free call
            </Button>
          </Link>
        </div>

        {/* Why it matters */}
        <div className="mb-20 bg-card border rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">They Don't Need Any App</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Unlike WhatsApp or Skype, your family doesn't need to download anything.
            Just call their regular phone number — landline or mobile — and they'll hear you loud and clear.
          </p>
        </div>

        {/* Benefits */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Why Families Choose Ringee</h2>
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

        {/* Testimonials */}
        <div className="mb-20">
          <h2 className="text-2xl font-bold mb-8">Stories from Our Users</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-card border rounded-xl p-6">
                <blockquote className="text-lg italic mb-4">
                  "{testimonial.quote}"
                </blockquote>
                <p className="font-medium">{testimonial.name}</p>
                <p className="text-sm text-muted-foreground">{testimonial.location}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Popular destinations */}
        <div className="mb-20">
          <h2 className="text-2xl font-bold mb-8">Popular Destinations</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['Venezuela', 'Colombia', 'Mexico', 'Cuba', 'Philippines', 'India', 'Nigeria', 'Pakistan'].map((country) => (
              <div key={country} className="bg-card border rounded-lg px-4 py-3 text-center font-medium">
                {country}
              </div>
            ))}
          </div>
          <p className="text-center text-muted-foreground mt-4">
            <Link href="/rate" className="text-primary hover:underline">See rates for all 180+ countries →</Link>
          </p>
        </div>

        {/* CTA */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Call home today
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Sign up in seconds and make your first call. No credit card required for your first free call.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Start calling now
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
