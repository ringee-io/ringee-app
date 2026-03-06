import { generateSEOMetadata } from '@/lib/seo-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, ArrowRight, Scale } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Compare Phone by Ringee.io with Alternatives',
  description:
    'See how Phone by Ringee.io compares to Skype, Google Voice, and other calling solutions. Detailed comparisons of features, pricing, and value.',
  canonical: '/compare',
  keywords: [
    'Ringee vs Skype',
    'Skype alternative',
    'Google Voice alternative',
    'VoIP comparison',
    'calling app comparison'
  ]
});

const comparisons = [
  {
    title: 'Ringee vs Skype',
    description:
      'Compare features, pricing, and user experience between Phone by Ringee.io and Skype.',
    href: '/compare/ringee-vs-skype',
    highlight: 'Most popular'
  },
  {
    title: 'Ringee vs Google Voice',
    description:
      'See how we stack up against Google Voice for personal and business calling.',
    href: '/compare/ringee-vs-google-voice',
    highlight: null
  },
  {
    title: 'Web Dialer vs Softphone',
    description:
      'Should you use a browser-based dialer or install a softphone app? We break it down.',
    href: '/compare/web-dialer-vs-softphone',
    highlight: null
  },
  {
    title: 'Pay-as-you-go vs Subscription',
    description:
      'Which pricing model is right for you? Compare pay-per-minute vs monthly plans.',
    href: '/compare/pay-as-you-go-vs-subscription',
    highlight: null
  }
];

export default function ComparePage() {
  return (
    <div className="container mx-auto max-w-6xl py-20 px-4">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
          <Scale className="h-4 w-4" />
          Comparisons
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
          How We Compare
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
          Choosing a calling solution? See detailed side-by-side comparisons to
          help you make the right decision.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        {comparisons.map((comp) => (
          <Link
            key={comp.title}
            href={comp.href}
            className="group bg-card border rounded-xl p-6 hover:border-primary/50 hover:shadow-lg transition-all relative"
          >
            {comp.highlight && (
              <div className="absolute -top-3 left-4 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                {comp.highlight}
              </div>
            )}
            <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
              {comp.title}
            </h2>
            <p className="text-muted-foreground mb-4">{comp.description}</p>
            <div className="flex items-center text-primary text-sm font-medium">
              Read comparison
              <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ))}
      </div>

      <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">
          Ready to try Phone by Ringee.io?
        </h2>
        <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
          Sign up free and make a test call. See the difference for yourself.
        </p>
        <Link href="/sign-up">
          <Button size="lg" className="gap-2">
            <Phone className="h-4 w-4" />
            Try a free call
          </Button>
        </Link>
      </div>
    </div>
  );
}
