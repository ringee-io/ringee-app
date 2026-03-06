import { generateSEOMetadata } from '@/lib/seo-utils';
import { productSchema, breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, Clock, Filter, Download } from 'lucide-react';
import { IconDialpad } from '@tabler/icons-react';

export const metadata = generateSEOMetadata({
  title: 'Call History - Complete Call Logs & Analytics',
  description:
    'Access detailed logs of all your calls. View duration, timestamps, recording links, and call outcomes. Filter, search, and export your call history easily.',
  canonical: '/features/call-history',
  keywords: [
    'call history',
    'call logs',
    'call analytics',
    'phone call records',
    'call tracking',
    'call reports'
  ]
});

const features = [
  {
    icon: Clock,
    title: 'Complete Call Logs',
    description: 'Every call logged with timestamp, duration, and outcome.'
  },
  {
    icon: Filter,
    title: 'Search & Filter',
    description: 'Find any call quickly with powerful search and filters.'
  },
  {
    icon: Download,
    title: 'Export Data',
    description: 'Export your call history for reporting and analysis.'
  }
];

export default function CallHistoryPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            productSchema({
              name: 'Call History by Phone by Ringee.io',
              description: 'Complete call logs and analytics for all your calls.'
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
              { name: 'Call History', url: '/features/call-history' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/features" className="hover:text-primary">Features</Link>
          <span className="mx-2">/</span>
          <span>Call History</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <IconDialpad className="h-4 w-4" />
            Feature
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Complete Call History & Analytics
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Never lose track of your communications. Access detailed logs of
            every call, including duration, timestamps, and linked recordings.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Get started free
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

        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Track every call you make
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Sign up and get instant access to your complete call history dashboard.
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
