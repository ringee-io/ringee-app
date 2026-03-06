import { generateSEOMetadata } from '@/lib/seo-utils';
import { productSchema, breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, ArrowRight } from 'lucide-react';
import { IconId } from '@tabler/icons-react';

export const metadata = generateSEOMetadata({
  title: 'Caller ID - Display Your Business Number',
  description:
    'Set your own caller ID when making calls. Display your business number, build trust with clients, and maintain professionalism with every outbound call.',
  canonical: '/features/caller-id',
  keywords: [
    'caller ID',
    'custom caller ID',
    'business caller ID',
    'outbound caller ID',
    'caller ID display',
    'professional caller ID',
    'VoIP caller ID'
  ]
});

const benefits = [
  'Display your business number on every outbound call',
  'Build trust with clients who see a familiar number',
  'Use different numbers for different purposes',
  'Change caller ID instantly from your dashboard',
  'Works with all your virtual numbers'
];

export default function CallerIdPage() {
  return (
    <>
      {/* Schema.org markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            productSchema({
              name: 'Caller ID by Phone by Ringee.io',
              description:
                'Custom caller ID that lets you display your business number when making calls.'
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
              { name: 'Features', url: '/features' },
              { name: 'Caller ID', url: '/features/caller-id' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/features" className="hover:text-primary">
            Features
          </Link>
          <span className="mx-2">/</span>
          <span>Caller ID</span>
        </nav>

        {/* Hero Section */}
        <div className="grid md:grid-cols-2 gap-12 items-center mb-20">
          <div>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
              <IconId className="h-4 w-4" />
              Feature
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Custom Caller ID
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Control what number appears when you make calls. Display your
              business number, build trust with clients, and maintain a
              professional image on every call.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/sign-up">
                <Button size="lg" className="gap-2">
                  <Phone className="h-4 w-4" />
                  Get started free
                </Button>
              </Link>
              <Link href="/buy-numbers">
                <Button size="lg" variant="outline" className="gap-2">
                  Browse Numbers
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="bg-card border rounded-2xl p-8">
            <div className="bg-background rounded-lg p-6 shadow-sm border">
              <div className="text-center mb-4">
                <div className="text-sm text-muted-foreground">
                  Outgoing call to
                </div>
                <div className="text-2xl font-mono font-bold">
                  +1 (555) 123-4567
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="text-sm text-muted-foreground mb-2">
                  Caller ID displayed:
                </div>
                <div className="bg-primary/10 text-primary px-4 py-3 rounded-lg font-mono text-lg font-semibold text-center">
                  +1 (800) YOUR-BIZ
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Benefits Section */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            Why Custom Caller ID Matters
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="flex items-start gap-3 bg-card border rounded-lg p-4"
              >
                <div className="bg-green-500/10 p-1 rounded-full">
                  <Check className="h-4 w-4 text-green-500" />
                </div>
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-primary font-bold">
                1
              </div>
              <h3 className="font-semibold mb-2">Get a Number</h3>
              <p className="text-muted-foreground text-sm">
                Purchase a virtual number or use an existing one as your caller
                ID.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-primary font-bold">
                2
              </div>
              <h3 className="font-semibold mb-2">Set Your Caller ID</h3>
              <p className="text-muted-foreground text-sm">
                Select which number to display before making your call.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-primary font-bold">
                3
              </div>
              <h3 className="font-semibold mb-2">Make Calls</h3>
              <p className="text-muted-foreground text-sm">
                Your chosen number appears on the recipient's phone.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Ready to use custom Caller ID?
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Get a virtual number and start making professional calls with your
            own caller ID today.
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
