import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@ringee/frontend-shared/components/ui/accordion';
import { generateSEOMetadata } from '@/lib/seo-utils';
import { faqPageSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone } from 'lucide-react';

export const metadata = generateSEOMetadata({
  title: 'FAQ - Frequently Asked Questions',
  description:
    'Get answers to common questions about Phone by Ringee.io. Learn about pricing, features, international calling, call recording, and more.',
  canonical: '/faq',
  keywords: [
    'Ringee FAQ',
    'VoIP questions',
    'phone service FAQ',
    'calling questions',
    'virtual number FAQ'
  ]
});

const faqs = [
  {
    question: 'How does Phone by Ringee.io work?',
    answer:
      'Phone by Ringee.io is a cloud-based phone system that lets you make and receive calls using your internet connection. You can use it directly from your browser or mobile device, without needing a traditional landline or SIM card.'
  },
  {
    question: 'Do I need to download any software?',
    answer:
      'No! Phone by Ringee.io works directly in your web browser. You can start making calls immediately after signing up. We also offer mobile capabilities if you prefer calling on the go.'
  },
  {
    question: 'Can I receive calls?',
    answer:
      'Yes! You can purchase virtual numbers in 100+ countries and receive calls directly in your browser or mobile device. Incoming calls are crystal clear and reliable.'
  },
  {
    question: 'How much does it cost?',
    answer:
      'We offer competitive rates that are up to 90% cheaper than traditional carriers. You can check our detailed rates on the Rates page. Calls to other Ringee users are always free.'
  },
  {
    question: 'Can I keep my existing number?',
    answer:
      'Yes, you can port your existing phone numbers to Phone by Ringee.io. Contact our support team for assistance with the porting process.'
  },
  {
    question: 'Is international calling supported?',
    answer:
      'Absolutely! You can make high-quality calls to over 180 countries worldwide at very low rates.'
  },
  {
    question: 'How secure is Phone by Ringee.io?',
    answer:
      'Security is our top priority. All calls are encrypted, and we use enterprise-grade security measures to protect your data and communications.'
  },
  {
    question: 'Can I record calls?',
    answer:
      'Yes, call recording is built-in and easy to use. You can record calls manually or set up automatic recording for compliance and training purposes.'
  }
];

export default function FAQPage() {
  return (
    <>
      {/* FAQPage schema for rich search results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            faqPageSchema(
              faqs.map((faq) => ({
                question: faq.question,
                answer: faq.answer
              }))
            )
          )
        }}
      />

      <div className='container mx-auto max-w-4xl py-20 px-4'>
        <div className='text-center mb-16'>
          <h1 className='text-4xl font-bold tracking-tight mb-4'>
            Frequently Asked Questions
          </h1>
          <p className='text-muted-foreground text-lg'>
            Everything you need to know about Phone by Ringee.io.
          </p>
        </div>

        <Accordion type='single' collapsible className='w-full mb-12'>
          {faqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger className='text-left'>
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className='text-muted-foreground'>
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {/* CTA */}
        <div className='text-center bg-primary/5 border border-primary/10 rounded-2xl p-8'>
          <h2 className='text-2xl font-bold mb-4'>Still have questions?</h2>
          <p className='text-muted-foreground mb-6'>
            Try a free call or reach out to our support team.
          </p>
          <div className='flex flex-col sm:flex-row gap-4 justify-center'>
            <Link href='/sign-up'>
              <Button className='gap-2'>
                <Phone className='h-4 w-4' />
                Try a free call
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
