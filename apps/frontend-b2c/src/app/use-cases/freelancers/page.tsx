import { generateSEOMetadata } from '@/lib/seo-utils';
import { breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, Briefcase, Globe, Lock, DollarSign } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Virtual Phone for Freelancers - Professional Calling Solution',
  description:
    'Get a dedicated business number as a freelancer. Keep your personal number private, call international clients affordably, and look professional.',
  canonical: '/use-cases/freelancers',
  keywords: [
    'phone for freelancers',
    'freelancer calling solution',
    'virtual number for freelancers',
    'business phone freelancer',
    'freelance phone number'
  ]
});

const challenges = [
  {
    icon: Lock,
    title: 'Privacy Concerns',
    problem: 'Sharing your personal number with every client',
    solution: 'Get a dedicated business number'
  },
  {
    icon: Globe,
    title: 'International Clients',
    problem: 'Expensive rates for calling overseas',
    solution: 'Rates up to 90% cheaper'
  },
  {
    icon: DollarSign,
    title: 'Unpredictable Costs',
    problem: 'Monthly subscriptions you may not fully use',
    solution: 'Pay only for what you use'
  }
];

const benefits = [
  'Separate business calls from personal',
  'Local numbers in 100+ countries',
  'No contracts or monthly minimums',
  'Call recording for client conversations',
  'Professional voicemail',
  'Works from any browser or device'
];

export default function FreelancersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Use Cases', url: '/use-cases' },
              { name: 'For Freelancers', url: '/use-cases/freelancers' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/use-cases" className="hover:text-primary">Use Cases</Link>
          <span className="mx-2">/</span>
          <span>For Freelancers</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <Briefcase className="h-4 w-4" />
            Use Case
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            The Professional Phone for Freelancers
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Keep your personal life private. Get a dedicated business number,
            call international clients affordably, and pay only for what you use.
          </p>
          <a href="https://www.ringee.io/" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Get your business number
            </Button>
          </a>
        </div>

        {/* Challenges & Solutions */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">
            Freelancer Challenges, Solved
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {challenges.map((item) => (
              <div key={item.title} className="bg-card border rounded-xl p-6">
                <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm mb-2">
                  <span className="text-red-500">Problem:</span> {item.problem}
                </p>
                <p className="text-sm">
                  <span className="text-green-500">Solution:</span> {item.solution}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Benefits */}
        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Why Freelancers Love Ringee</h2>
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

        {/* Testimonial */}
        <div className="mb-20 bg-card border rounded-2xl p-8">
          <blockquote className="text-lg italic text-center text-muted-foreground">
            "As a freelance consultant, I needed a professional number without the commitment of a contract. Ringee gives me exactly that — I only pay when I call clients, and the rates are great."
          </blockquote>
          <p className="text-center mt-4 font-medium">
            — Luis R., Freelance Consultant
          </p>
        </div>

        {/* CTA */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Start calling clients professionally
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Get a business number in minutes. No contracts, no monthly fees — just
            pay for what you use.
          </p>
          <a href="https://www.ringee.io/sign-up" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Get started with Ringee
            </Button>
          </a>
        </div>
      </div>
    </>
  );
}
