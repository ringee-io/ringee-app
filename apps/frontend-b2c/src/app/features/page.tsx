import { generateSEOMetadata } from '@/lib/seo-utils';
import { productSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  IconDialpad,
  IconPhoneCalling,
  IconPlayerRecord,
  IconAddressBook,
  IconWorld,
  IconId
} from '@tabler/icons-react';
import { Phone } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Features - Everything You Need to Call from Anywhere',
  description:
    'Discover all Phone by Ringee.io features: virtual numbers in 100+ countries, call recording, caller ID, contact management, and browser-based WebRTC calling.',
  canonical: '/features',
  keywords: [
    'phone features',
    'calling features',
    'virtual phone features',
    'VoIP features',
    'call recording',
    'caller ID',
    'virtual numbers',
    'browser calling'
  ]
});

const features = [
  {
    icon: IconId,
    title: 'Caller ID',
    description:
      'Display your business number when making calls. Build trust and professionalism with every call.',
    href: '/features/caller-id'
  },
  {
    icon: IconPhoneCalling,
    title: 'Virtual Numbers',
    description:
      'Get local phone numbers in over 100 countries. Establish local presence anywhere in the world.',
    href: '/features/virtual-numbers'
  },
  {
    icon: IconPlayerRecord,
    title: 'Call Recording',
    description:
      'Record calls automatically or on-demand. Perfect for training, compliance, and quality assurance.',
    href: '/features/call-recording'
  },
  {
    icon: IconDialpad,
    title: 'Call History',
    description:
      'Access complete logs of all your calls. Track duration, timestamps, and call outcomes.',
    href: '/features/call-history'
  },
  {
    icon: IconAddressBook,
    title: 'Contact Management',
    description:
      'Organize all your contacts in one place. Quick dial, notes, and call history per contact.',
    href: '/features/contacts'
  },
  {
    icon: IconWorld,
    title: 'WebRTC Calling',
    description:
      'Make crystal-clear calls directly from your browser. No downloads, no plugins required.',
    href: '/features/webrtc-calling'
  }
];

export default function FeaturesPage() {
  return (
    <>
      {/* Schema.org markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            productSchema({
              name: 'Phone by Ringee.io',
              description:
                'Complete virtual phone solution with numbers in 100+ countries, call recording, and browser-based calling.',
              price: '0.020',
              priceCurrency: 'USD'
            })
          )
        }}
      />

      <div className="container mx-auto max-w-7xl py-20 px-4">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Everything You Need to Call from Anywhere
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Phone by Ringee.io gives you all the tools to make professional
            calls worldwide. Virtual numbers, call recording, and crystal-clear
            WebRTC calling — all from your browser.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {features.map((feature) => (
            <Link
              key={feature.title}
              href={feature.href}
              className="group bg-card border rounded-xl p-6 hover:border-primary/50 hover:shadow-lg transition-all"
            >
              <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                {feature.title}
              </h2>
              <p className="text-muted-foreground">{feature.description}</p>
            </Link>
          ))}
        </div>

        {/* CTA Section */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Ready to start calling?
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Sign up in seconds and get a free trial call. No credit card
            required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="gap-2">
                <Phone className="h-4 w-4" />
                Try a free call
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline">
                View Pricing
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
