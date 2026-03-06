import { generateSEOMetadata } from '@/lib/seo-utils';
import { articleSchema, breadcrumbSchema, howToSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Chrome, Mic, Headphones } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'How to Make Calls from Your Browser - Complete Guide',
  description:
    'Learn how to make crystal-clear phone calls directly from your web browser using WebRTC. No downloads, no plugins — step-by-step guide.',
  canonical: '/guides/browser-calling-guide',
  keywords: [
    'browser calling',
    'call from browser',
    'WebRTC calling',
    'web phone guide',
    'how to call from computer'
  ],
  type: 'article',
  publishedTime: '2026-01-01'
});

const steps = [
  {
    title: 'Use a supported browser',
    content:
      'Phone by Ringee.io works on Chrome, Firefox, Safari, and Edge. Make sure your browser is up to date for the best experience.'
  },
  {
    title: 'Allow microphone access',
    content:
      'When prompted, allow the website to access your microphone. This is required for two-way audio.'
  },
  {
    title: 'Create an account',
    content:
      'Sign up for Phone by Ringee.io. It takes less than a minute and you can start calling immediately.'
  },
  {
    title: 'Add credit (optional)',
    content:
      'Add credit to call regular phones. Calls to other Ringee users are free.'
  },
  {
    title: 'Dial and call',
    content:
      'Use the dialer to enter any phone number and click call. Your call connects in seconds.'
  }
];

const requirements = [
  {
    icon: Chrome,
    title: 'Modern Browser',
    description: 'Chrome, Firefox, Safari, or Edge'
  },
  {
    icon: Mic,
    title: 'Microphone',
    description: 'Built-in or external microphone'
  },
  {
    icon: Headphones,
    title: 'Audio Output',
    description: 'Speakers or headphones'
  }
];

export default function BrowserCallingGuidePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            articleSchema({
              title: 'How to Make Calls from Your Browser',
              description: 'Step-by-step guide to browser-based calling.',
              url: '/guides/browser-calling-guide',
              publishedDate: '2026-01-01'
            })
          )
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            howToSchema({
              name: 'How to Make Phone Calls from Your Browser',
              description: 'Make calls directly from your web browser without any downloads.',
              steps: steps.map((s) => ({ name: s.title, text: s.content })),
              totalTime: 'PT5M'
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
              { name: 'Browser Calling Guide', url: '/guides/browser-calling-guide' }
            ])
          )
        }}
      />

      <article className="container mx-auto max-w-3xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/guides" className="hover:text-primary">Guides</Link>
          <span className="mx-2">/</span>
          <span>Browser Calling Guide</span>
        </nav>

        <header className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            How to Make Calls from Your Browser
          </h1>
          <p className="text-lg text-muted-foreground">
            Make crystal-clear phone calls directly from Chrome, Firefox, Safari,
            or Edge. No downloads, no plugins — just open and call.
          </p>
        </header>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">What You'll Need</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {requirements.map((req) => (
              <div key={req.title} className="bg-card border rounded-lg p-4 text-center">
                <req.icon className="h-8 w-8 mx-auto mb-2 text-primary" />
                <h3 className="font-medium">{req.title}</h3>
                <p className="text-sm text-muted-foreground">{req.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Step-by-Step Guide</h2>
          <div className="space-y-6">
            {steps.map((step, index) => (
              <div key={step.title} className="flex gap-4">
                <div className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0">
                  {index + 1}
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{step.title}</h3>
                  <p className="text-muted-foreground">{step.content}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12 bg-muted/30 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4">Tips for Best Call Quality</h2>
          <ul className="space-y-2 text-sm">
            <li>• Use a wired internet connection when possible</li>
            <li>• Close bandwidth-heavy apps during calls</li>
            <li>• Use headphones to prevent echo</li>
            <li>• Find a quiet environment</li>
          </ul>
        </section>

        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-4">Ready to try it?</h2>
          <p className="text-muted-foreground mb-6">
            Make your first browser call in under a minute.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Try a free call
            </Button>
          </Link>
        </div>
      </article>
    </>
  );
}
