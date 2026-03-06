import { generateSEOMetadata } from '@/lib/seo-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, BookOpen, ArrowRight } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Guides - Learn VoIP, Calling, and Phone Numbers',
  description:
    'Learn everything about VoIP, virtual phone numbers, browser calling, and international rates. Practical guides for beginners and pros.',
  canonical: '/guides',
  keywords: [
    'VoIP guide',
    'phone number guide',
    'calling guide',
    'virtual number tutorial',
    'VoIP glossary'
  ]
});

const guides = [
  {
    title: 'VoIP Glossary',
    description: 'All the VoIP and calling terminology explained in plain English.',
    href: '/guides/voip-glossary',
    readTime: '5 min read'
  },
  {
    title: 'How to Choose a Phone Number',
    description:
      'Local, toll-free, or mobile? Which type of virtual number is right for you?',
    href: '/guides/choosing-phone-number',
    readTime: '4 min read'
  },
  {
    title: 'Browser Calling Guide',
    description:
      'How to make high-quality calls directly from your browser using WebRTC.',
    href: '/guides/browser-calling-guide',
    readTime: '3 min read'
  },
  {
    title: 'Understanding International Calling Rates',
    description:
      'How international calling rates work and how to save money on overseas calls.',
    href: '/guides/international-calling-rates',
    readTime: '4 min read'
  }
];

export default function GuidesPage() {
  return (
    <div className="container mx-auto max-w-4xl py-20 px-4">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
          <BookOpen className="h-4 w-4" />
          Guides
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
          Learn VoIP and Calling
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Practical guides to help you understand VoIP, choose the right phone
          number, and get the most out of your calling solution.
        </p>
      </div>

      <div className="space-y-6 mb-16">
        {guides.map((guide) => (
          <Link
            key={guide.title}
            href={guide.href}
            className="group block bg-card border rounded-xl p-6 hover:border-primary/50 hover:shadow-lg transition-all"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                  {guide.title}
                </h2>
                <p className="text-muted-foreground">{guide.description}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                {guide.readTime}
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">
          Ready to start calling?
        </h2>
        <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
          Put your knowledge to use. Sign up and make your first call in minutes.
        </p>
        <Link href="/sign-up">
          <Button size="lg" className="gap-2">
            <Phone className="h-4 w-4" />
            Get started free
          </Button>
        </Link>
      </div>
    </div>
  );
}
