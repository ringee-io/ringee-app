import { generateSEOMetadata } from '@/lib/seo-utils';
import { productSchema, breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, Wifi, Lock, Zap } from 'lucide-react';
import { IconWorld } from '@tabler/icons-react';

export const metadata = generateSEOMetadata({
  title: 'WebRTC Calling - Crystal-Clear Browser Calls',
  description:
    'Make HD voice calls directly from your browser using WebRTC technology. No downloads, no plugins — just open your browser and start calling.',
  canonical: '/features/webrtc-calling',
  keywords: [
    'WebRTC calling',
    'browser calling',
    'web phone',
    'browser phone',
    'no download calling',
    'online phone calls',
    'WebRTC VoIP'
  ]
});

const features = [
  {
    icon: Wifi,
    title: 'No Downloads Required',
    description: 'Works in any modern browser. Just open and start calling.'
  },
  {
    icon: Lock,
    title: 'Encrypted Calls',
    description: 'All calls are encrypted end-to-end using WebRTC security.'
  },
  {
    icon: Zap,
    title: 'HD Voice Quality',
    description: 'Crystal-clear audio using modern codecs and protocols.'
  }
];

const benefits = [
  'Works on Chrome, Firefox, Safari, and Edge',
  'No software installation needed',
  'Automatic echo cancellation',
  'Works on any device with a browser',
  'Low latency connections worldwide'
];

export default function WebRTCCallingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            productSchema({
              name: 'WebRTC Calling by Phone by Ringee.io',
              description: 'Crystal-clear browser-based calling using WebRTC.'
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
              { name: 'WebRTC Calling', url: '/features/webrtc-calling' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/features" className="hover:text-primary">Features</Link>
          <span className="mx-2">/</span>
          <span>WebRTC Calling</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <IconWorld className="h-4 w-4" />
            Feature
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Crystal-Clear Calls from Your Browser
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Make HD voice calls using WebRTC technology. No downloads, no plugins —
            just open your browser and start calling anyone in the world.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Try a free call
            </Button>
          </Link>
        </div>

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

        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Technical Advantages</h2>
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

        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Start calling from your browser
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            No downloads. No installations. Just crystal-clear calls.
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
