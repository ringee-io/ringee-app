import { generateSEOMetadata } from '@/lib/seo-utils';
import { productSchema, breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, ArrowRight, Shield, Download, Play } from 'lucide-react';
import { IconPlayerRecord } from '@tabler/icons-react';

export const metadata = generateSEOMetadata({
  title: 'Call Recording - Record and Save Your Calls',
  description:
    'Record calls automatically or on-demand with Phone by Ringee.io. Secure cloud storage, easy playback, and download options. Perfect for training and compliance.',
  canonical: '/features/call-recording',
  keywords: [
    'call recording',
    'record phone calls',
    'call recording online',
    'automatic call recording',
    'VoIP call recording',
    'business call recording',
    'compliance call recording'
  ]
});

const features = [
  {
    icon: Play,
    title: 'On-Demand or Automatic',
    description:
      'Record calls manually with one click or set up automatic recording for all calls.'
  },
  {
    icon: Shield,
    title: 'Secure Cloud Storage',
    description:
      'All recordings are encrypted and stored securely in the cloud. Access them anytime.'
  },
  {
    icon: Download,
    title: 'Easy Download',
    description:
      'Download recordings in standard audio formats for archiving or sharing.'
  }
];

const useCases = [
  'Training new team members with real call examples',
  'Quality assurance and performance monitoring',
  'Compliance and legal documentation',
  'Reviewing important client conversations',
  'Resolving disputes with call evidence'
];

export default function CallRecordingPage() {
  return (
    <>
      {/* Schema.org markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            productSchema({
              name: 'Call Recording by Phone by Ringee.io',
              description:
                'Record and save your calls with secure cloud storage and easy playback.'
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
              { name: 'Call Recording', url: '/features/call-recording' }
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
          <span>Call Recording</span>
        </nav>

        {/* Hero Section */}
        <div className="grid md:grid-cols-2 gap-12 items-center mb-20">
          <div>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
              <IconPlayerRecord className="h-4 w-4" />
              Feature
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Call Recording
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Never miss an important detail. Record your calls automatically or
              on-demand, store them securely in the cloud, and access them
              whenever you need.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/sign-up">
                <Button size="lg" className="gap-2">
                  <Phone className="h-4 w-4" />
                  Start recording calls
                </Button>
              </Link>
              <Link href="/recordings">
                <Button size="lg" variant="outline" className="gap-2">
                  View Recordings
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="bg-card border rounded-2xl p-6">
            <div className="space-y-4">
              {/* Mock recording item */}
              <div className="bg-background rounded-lg p-4 border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Sales call with John</span>
                  <span className="text-sm text-muted-foreground">12:34</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-8 bg-primary/10 rounded flex items-center px-3">
                    <div className="w-full h-1 bg-primary/30 rounded">
                      <div className="w-1/3 h-1 bg-primary rounded" />
                    </div>
                  </div>
                  <Button size="sm" variant="ghost">
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="bg-background rounded-lg p-4 border opacity-60">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Support call</span>
                  <span className="text-sm text-muted-foreground">8:15</span>
                </div>
                <div className="h-8 bg-primary/5 rounded" />
              </div>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            Recording Features
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-card border rounded-xl p-6"
              >
                <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Use Cases */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            Common Use Cases
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {useCases.map((useCase, index) => (
              <div
                key={index}
                className="flex items-center gap-3 bg-card border rounded-lg p-4"
              >
                <div className="bg-green-500/10 p-1 rounded-full shrink-0">
                  <Check className="h-4 w-4 text-green-500" />
                </div>
                <span>{useCase}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Start recording your calls today
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Sign up now and get access to call recording with secure cloud
            storage included.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Get started free
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
