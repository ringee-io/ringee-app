import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, Laptop, Download } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Web Dialer vs Softphone - Which Is Better? (2026)',
  description:
    'Compare browser-based web dialers vs softphone apps. Learn the pros and cons of each approach for business and personal calling.',
  canonical: '/compare/web-dialer-vs-softphone',
  keywords: [
    'web dialer vs softphone',
    'browser phone vs app',
    'WebRTC dialer',
    'softphone comparison',
    'browser calling'
  ]
});

export default function WebDialerVsSoftphonePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Comparisons', url: '/compare' },
              { name: 'Web Dialer vs Softphone', url: '/compare/web-dialer-vs-softphone' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/compare" className="hover:text-primary">Comparisons</Link>
          <span className="mx-2">/</span>
          <span>Web Dialer vs Softphone</span>
        </nav>

        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Web Dialer vs Softphone: Which Is Right for You?
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Should you make calls from your browser or download a dedicated app? 
            Here's everything you need to know.
          </p>
        </div>

        {/* Comparison */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Laptop className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-bold">Web Dialer (Browser-Based)</h2>
            </div>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <span>No installation required — works instantly</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <span>Always up-to-date (no manual updates)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <span>Works on any device with a browser</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <span>Nothing to uninstall if you stop using</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <span>Great for shared/public computers</span>
              </li>
            </ul>
          </div>

          <div className="bg-card border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-muted p-2 rounded-lg">
                <Download className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold">Softphone (Installed App)</h2>
            </div>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <span>May work offline for some features</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <span>Desktop notifications even when browser closed</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <span>Dedicated app for heavy daily use</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground">Requires download and installation</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground">Manual updates needed</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Verdict */}
        <div className="mb-16 bg-card border rounded-xl p-8">
          <h2 className="text-2xl font-bold mb-4">Our Recommendation</h2>
          <p className="text-muted-foreground mb-4">
            For most users, a <strong>web dialer is simpler and more convenient</strong>. 
            Modern WebRTC technology delivers excellent call quality directly in your browser, 
            with no downloads or updates to worry about.
          </p>
          <p className="text-muted-foreground">
            Phone by Ringee.io uses a browser-based approach powered by WebRTC, giving you HD calls 
            without installing anything.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Try browser-based calling
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            No downloads. Just open your browser and start calling.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Try a free call
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
