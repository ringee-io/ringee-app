import { generateSEOMetadata } from '@/lib/seo-utils';
import { articleSchema, breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'VoIP Glossary - Complete Guide to VoIP Terminology',
  description:
    'Learn all the VoIP and calling terminology. From WebRTC to SIP, codecs to latency — every term explained in plain English.',
  canonical: '/guides/voip-glossary',
  keywords: [
    'VoIP glossary',
    'VoIP terms',
    'what is VoIP',
    'SIP explained',
    'WebRTC meaning',
    'VoIP terminology'
  ],
  type: 'article',
  publishedTime: '2026-01-01'
});

const terms = [
  {
    term: 'VoIP',
    definition:
      'Voice over Internet Protocol. Technology that lets you make phone calls using the internet instead of traditional phone lines. This is how Phone by Ringee.io works.'
  },
  {
    term: 'WebRTC',
    definition:
      'Web Real-Time Communication. Browser technology that enables voice and video calls without plugins or downloads. Phone by Ringee.io uses WebRTC for crystal-clear browser calling.'
  },
  {
    term: 'SIP',
    definition:
      'Session Initiation Protocol. A signaling protocol used to start, maintain, and end VoIP calls. Think of it as the "phone number" protocol for the internet.'
  },
  {
    term: 'Codec',
    definition:
      'Software that compresses and decompresses audio. Better codecs mean clearer calls with less bandwidth. Common codecs include Opus, G.711, and G.729.'
  },
  {
    term: 'Latency',
    definition:
      'The delay between speaking and the other person hearing you. Lower latency means more natural conversations. VoIP typically has 20-150ms latency.'
  },
  {
    term: 'Jitter',
    definition:
      'Variation in packet arrival time. High jitter can cause choppy audio. Good VoIP services use jitter buffers to smooth out the audio.'
  },
  {
    term: 'Virtual Number',
    definition:
      'A phone number not tied to a physical phone line or SIM card. Virtual numbers work over the internet and can be used from any device.'
  },
  {
    term: 'DID (Direct Inward Dialing)',
    definition:
      'A virtual phone number that routes calls directly to you. When someone calls your DID, it rings on your VoIP device or browser.'
  },
  {
    term: 'PSTN',
    definition:
      'Public Switched Telephone Network. The traditional landline phone system. VoIP connects to PSTN to call regular phones.'
  },
  {
    term: 'Softphone',
    definition:
      'Software application that lets you make VoIP calls from a computer or mobile device. Phone by Ringee.io works as a web-based softphone.'
  },
  {
    term: 'Call Termination',
    definition:
      'The process of connecting a VoIP call to a regular phone number on the PSTN. Termination rates vary by destination country.'
  },
  {
    term: 'Caller ID',
    definition:
      'The phone number displayed on the recipient\'s phone when you call. With VoIP, you can often choose which number to display.'
  }
];

export default function VoipGlossaryPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            articleSchema({
              title: 'VoIP Glossary - Complete Guide to VoIP Terminology',
              description: 'Learn all VoIP and calling terminology explained simply.',
              url: '/guides/voip-glossary',
              publishedDate: '2026-01-01'
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
              { name: 'VoIP Glossary', url: '/guides/voip-glossary' }
            ])
          )
        }}
      />

      <article className="container mx-auto max-w-3xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/guides" className="hover:text-primary">Guides</Link>
          <span className="mx-2">/</span>
          <span>VoIP Glossary</span>
        </nav>

        <header className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            VoIP Glossary
          </h1>
          <p className="text-lg text-muted-foreground">
            All the VoIP and calling terminology you need to know, explained in
            plain English.
          </p>
        </header>

        <div className="space-y-8 mb-16">
          {terms.map((item) => (
            <div key={item.term} className="border-b pb-6">
              <h2 className="text-xl font-semibold mb-2">{item.term}</h2>
              <p className="text-muted-foreground">{item.definition}</p>
            </div>
          ))}
        </div>

        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-4">Ready to try VoIP calling?</h2>
          <p className="text-muted-foreground mb-6">
            Experience modern calling technology firsthand.
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
