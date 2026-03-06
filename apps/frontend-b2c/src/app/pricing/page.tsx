import { generateSEOMetadata } from '@/lib/seo-utils';
import { productSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, DollarSign, CreditCard, Globe } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@ringee/frontend-shared/components/ui/accordion';

export const metadata = generateSEOMetadata({
  title: 'Pricing - Simple Pay-as-you-go Rates',
  description:
    'Simple, transparent pricing. Pay only for what you use with rates starting at $0.02/minute. No contracts, no monthly fees, no hidden costs.',
  canonical: '/pricing',
  keywords: [
    'VoIP pricing',
    'calling rates',
    'pay as you go phone',
    'cheap international calls',
    'virtual number cost'
  ]
});

const highlights = [
  {
    icon: DollarSign,
    title: 'Pay-as-you-go',
    description: 'No monthly fees. No subscriptions. Pay only for the minutes you use.'
  },
  {
    icon: CreditCard,
    title: 'Add Credits Anytime',
    description: 'Top up your account with as little as $5. Credits never expire.'
  },
  {
    icon: Globe,
    title: 'Transparent Rates',
    description: 'See exactly what you\'ll pay before you call. No surprises.'
  }
];

const pricingItems = [
  { item: 'Outbound calls', price: 'From $0.020/min', note: 'Varies by destination' },
  { item: 'Virtual numbers', price: 'From $1.90/month', note: 'Per number' },
  { item: 'Call recording', price: 'Included', note: 'No extra cost' },
  { item: 'Incoming calls', price: 'Included', note: 'With your number' },
  { item: 'Account', price: 'Free', note: 'No monthly fee' }
];

const faqs = [
  {
    question: 'Do I need to pay a monthly fee?',
    answer: 'No. Phone by Ringee.io is pay-as-you-go. You only pay for the calls you make and any virtual numbers you rent. There is no monthly subscription or account fee.'
  },
  {
    question: 'How do I add credits?',
    answer: 'You can add credits via credit/debit card or PayPal. Minimum top-up is $5. Credits are added instantly to your account.'
  },
  {
    question: 'Do credits expire?',
    answer: 'No, your credits never expire as long as your account remains active.'
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit and debit cards (Visa, Mastercard, American Express) as well as PayPal. All payments are securely processed by Stripe.'
  },
  {
    question: 'Can I get a refund?',
    answer: 'Unused credits can be refunded within 30 days of purchase. Please contact support for refund requests.'
  }
];

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            productSchema({
              name: 'Phone by Ringee.io',
              description: 'Virtual phone numbers and international calling',
              price: '0.020',
              priceCurrency: 'USD'
            })
          )
        }}
      />

      <div className="container mx-auto max-w-5xl py-20 px-4">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            No monthly fees. No contracts. Just pay for what you use with
            crystal-clear rates.
          </p>
        </div>

        {/* Highlights */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {highlights.map((item) => (
            <div key={item.title} className="bg-card border rounded-xl p-6 text-center">
              <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4">
                <item.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
              <p className="text-muted-foreground text-sm">{item.description}</p>
            </div>
          ))}
        </div>

        {/* Pricing Table */}
        <div className="bg-card border rounded-2xl p-6 md:p-8 mb-16">
          <h2 className="text-2xl font-bold mb-6">What You'll Pay</h2>
          <div className="space-y-4">
            {pricingItems.map((item) => (
              <div key={item.item} className="flex items-center justify-between py-3 border-b last:border-0">
                <div>
                  <span className="font-medium">{item.item}</span>
                  <span className="text-muted-foreground text-sm ml-2">({item.note})</span>
                </div>
                <span className="font-semibold text-primary">{item.price}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/rate">
              <Button variant="outline">View All Rates by Country</Button>
            </Link>
            <Link href="/sign-up">
              <Button className="gap-2">
                <Phone className="h-4 w-4" />
                Get Started Free
              </Button>
            </Link>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Pricing FAQ</h2>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* CTA */}
        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-4">Try before you pay</h2>
          <p className="text-muted-foreground mb-6">
            Sign up free and make a test call to see the quality for yourself.
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
