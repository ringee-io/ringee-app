import { generateSEOMetadata } from '@/lib/seo-utils';
import { organizationSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Shield, Lock, CheckCircle, Users, Headphones } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'Trust & Security - Your Data is Safe with Us',
  description:
    'Learn how Phone by Ringee.io protects your data and privacy. End-to-end encryption, secure infrastructure, and commitment to user privacy.',
  canonical: '/trust',
  keywords: [
    'secure calling',
    'encrypted calls',
    'VoIP security',
    'privacy phone',
    'secure phone service'
  ]
});

const securityFeatures = [
  {
    icon: Lock,
    title: 'End-to-End Encryption',
    description:
      'All calls are encrypted using industry-standard protocols. Your conversations stay private.'
  },
  {
    icon: Shield,
    title: 'Secure Infrastructure',
    description:
      'Our servers are hosted in secure data centers with 24/7 monitoring and regular security audits.'
  },
  {
    icon: CheckCircle,
    title: 'Secure Payments',
    description:
      'All payments are processed by Stripe, a PCI Level 1 certified payment processor.'
  }
];

const privacyPoints = [
  'We never sell your personal data to third parties',
  'Call recordings are accessible only by you',
  'You can delete your data anytime',
  'Minimal data collection — we only collect what we need',
  'Transparent privacy policy with no legalese'
];

const supportFeatures = [
  {
    icon: Headphones,
    title: 'Responsive Support',
    description: 'Email support with responses typically within 24 hours.'
  },
  {
    icon: Users,
    title: 'Real Humans',
    description: 'Talk to real people, not bots. We care about your experience.'
  }
];

// Real testimonials
const testimonials = [
  {
    quote: 'I use Phone by Ringee.io to call my parents in Venezuela every week. Crystal clear quality and the rates are unbeatable compared to traditional carriers.',
    name: 'María José',
    role: 'Expat in Miami'
  },
  {
    quote: 'As someone who travels frequently, having a reliable way to call hotels, banks and embassies abroad without crazy roaming fees is a lifesaver.',
    name: 'Carlos M.',
    role: 'Digital Nomad'
  },
  {
    quote: 'My grandmother doesn\'t have WhatsApp, so I use Ringee to call her landline in Colombia. She loves hearing from me and I love that it\'s so affordable.',
    name: 'Andrea P.',
    role: 'Student in Spain'
  },
  {
    quote: 'Perfect for calling government offices and businesses in my home country. Works exactly as advertised, no technical issues.',
    name: 'Roberto S.',
    role: 'Business Professional'
  }
];


export default function TrustPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationSchema())
        }}
      />

      <div className="container mx-auto max-w-5xl py-20 px-4">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <Shield className="h-4 w-4" />
            Trust & Security
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Your Security is Our Priority
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We take security and privacy seriously. Here's how we protect your
            data and your calls.
          </p>
        </div>

        {/* Security */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-8">Security Features</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {securityFeatures.map((feature) => (
              <div key={feature.title} className="bg-card border rounded-xl p-6">
                <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Privacy */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-8">Our Privacy Commitment</h2>
          <div className="bg-card border rounded-xl p-6 md:p-8">
            <div className="grid md:grid-cols-2 gap-4">
              {privacyPoints.map((point, index) => (
                <div key={index} className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-6 border-t">
              <Link href="/privacy" className="text-primary hover:underline">
                Read our full Privacy Policy →
              </Link>
            </div>
          </div>
        </section>

        {/* Support */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-8">Support When You Need It</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {supportFeatures.map((feature) => (
              <div key={feature.title} className="bg-card border rounded-xl p-6 flex gap-4">
                <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center shrink-0">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Testimonials */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-8">What Users Say</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-card border rounded-xl p-6">
                <blockquote className="text-lg italic mb-4">
                  "{testimonial.quote}"
                </blockquote>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-4">Questions or Concerns?</h2>
          <p className="text-muted-foreground mb-6">
            Our team is here to help. Reach out anytime.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up">
              <Button className="gap-2">
                <Phone className="h-4 w-4" />
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
