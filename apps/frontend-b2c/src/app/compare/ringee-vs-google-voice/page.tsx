import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, X } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Ringee vs Google Voice - Detailed Comparison (2026)',
  description:
    'Compare Phone by Ringee.io vs Google Voice. See feature differences, international calling rates, and which is better for personal or business use.',
  canonical: '/compare/ringee-vs-google-voice',
  keywords: [
    'Ringee vs Google Voice',
    'Google Voice alternative',
    'better than Google Voice',
    'Google Voice competitor'
  ]
});

const features = [
  { name: 'Virtual phone numbers', ringee: true, gv: true },
  { name: 'Browser-based calling', ringee: true, gv: true },
  { name: 'Call recording', ringee: true, gv: false },
  { name: 'Numbers in 100+ countries', ringee: true, gv: false },
  { name: 'Instant activation', ringee: true, gv: false },
  { name: 'No Google account required', ringee: true, gv: false },
  { name: 'Pay-as-you-go', ringee: true, gv: false },
  { name: 'Works worldwide', ringee: true, gv: false },
  { name: 'Free US domestic calling', ringee: false, gv: true },
  { name: 'Contact management', ringee: true, gv: true }
];

export default function RingeeVsGoogleVoicePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Comparisons', url: '/compare' },
              { name: 'Ringee vs Google Voice', url: '/compare/ringee-vs-google-voice' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/compare" className="hover:text-primary">Comparisons</Link>
          <span className="mx-2">/</span>
          <span>Ringee vs Google Voice</span>
        </nav>

        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Phone by Ringee.io vs Google Voice
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Google Voice is US-focused and free for domestic calls.
            Ringee.io works globally with numbers in 100+ countries.
          </p>
        </div>

        {/* Feature Table */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-8">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-4 text-left border-b">Feature</th>
                  <th className="p-4 text-center border-b bg-primary/5">Phone by Ringee.io</th>
                  <th className="p-4 text-center border-b">Google Voice</th>
                </tr>
              </thead>
              <tbody>
                {features.map((feature, index) => (
                  <tr key={feature.name} className={index % 2 === 0 ? '' : 'bg-muted/20'}>
                    <td className="p-4 text-sm">{feature.name}</td>
                    <td className="p-4 text-center bg-primary/5">
                      {feature.ringee ? (
                        <Check className="h-5 w-5 text-green-500 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-red-500 mx-auto" />
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {feature.gv ? (
                        <Check className="h-5 w-5 text-green-500 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-red-500 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Verdict */}
        <div className="mb-16 bg-card border rounded-xl p-8">
          <h2 className="text-2xl font-bold mb-4">The Verdict</h2>
          <p className="text-muted-foreground mb-4">
            <strong>Choose Phone by Ringee.io if:</strong> You need international numbers,
            call recording, or live outside the US. Better for business use and global calling.
          </p>
          <p className="text-muted-foreground">
            <strong>Choose Google Voice if:</strong> You're in the US and primarily need
            free domestic calling with a US number.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Go global with Phone by Ringee.io
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Get numbers anywhere. Call anyone. Pay only for what you use.
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
