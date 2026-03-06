'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@ringee/frontend-shared/components/ui/accordion';
import {
  Phone,
  ShieldCheck,
  CreditCard,
  Wifi,
  // Users,
  Zap,
  Globe,
  Info
} from 'lucide-react';

const faq = [
  {
    icon: Wifi,
    question: 'How does browser-based calling work?',
    answer:
      'Ringee.io uses WebRTC technology to connect calls directly from your browser — no downloads or extensions required. When you dial, your browser connects securely to the global phone network in real time.'
  },
  {
    icon: Phone,
    question: 'Can I receive incoming calls?',
    answer:
      'Yes! You can rent a number from Ringee or use your own verified number to receive calls in your browser. You can even forward calls to your mobile if you prefer.'
  },
  {
    icon: Zap,
    question: 'Do you support SMS messaging?',
    answer:
      'Not yet — our focus is 100% on delivering the best calling quality at the lowest possible rates. SMS support is already on our roadmap for upcoming releases.'
  },
  // {
  //   icon: Users,
  //   question: 'Is there a referral program?',
  //   answer:
  //     'Yes. You can earn cash rewards for every user you refer who adds credit to their account. To get your referral link, just contact us at info@ringee.io.'
  // },
  {
    icon: Globe,
    question: 'Why are your prices so competitive?',
    answer:
      'Our infrastructure runs on the same Tier-1 networks used by major carriers, but without the middlemen. That means faster connections, transparent pricing, and global reach in over 180 countries.'
  },
  {
    icon: Info,
    question: 'Why not just use apps like WhatsApp or Google Voice?',
    answer:
      'Those apps only allow calls within their own platform. Ringee lets you call any landline or mobile number — worldwide — directly from your browser, no apps or accounts required on the other side.'
  },
  {
    icon: ShieldCheck,
    question: 'Is my call data private?',
    answer:
      'Absolutely. All audio streams are encrypted end-to-end, and we store only minimal metadata for your call history. Your privacy and security are core to our platform.'
  },
  {
    icon: CreditCard,
    question: 'Do I need a subscription?',
    answer:
      'No subscriptions here — Ringee.io works on a pay-as-you-go model. Add credit whenever you need, and pay only for the minutes and numbers you actually use.'
  },
  {
    icon: CreditCard,
    question: 'How do I add credit to my account?',
    answer:
      'You can top up instantly with any major credit card or PayPal through our secure Stripe integration. All payments are encrypted and PCI-compliant.'
  },
  {
    icon: Wifi,
    question: 'What if I experience call quality issues?',
    answer:
      'Quality depends on your internet connection. For the best results, use a stable broadband or Wi-Fi network. If issues persist, our support team can help you troubleshoot in real time.'
  }
];

export default function FAQ() {
  return (
    <section
      id='faq'
      className='xs:py-20 flex flex-col items-center justify-center px-6 py-12'
    >
      <div className='w-full max-w-screen-lg'>
        <h2 className='xs:text-4xl text-center text-3xl font-bold tracking-tight md:text-5xl'>
          Frequently Asked Questions
        </h2>
        <p className='xs:text-lg text-muted-foreground mt-3 mb-8 text-center'>
          Everything you need to know about using Ringee.io, pricing, and call
          quality.
        </p>

        <Accordion type='single' collapsible className='w-full'>
          {faq.map(({ question, answer, icon: Icon }, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className='border-border/60 border-b py-3'
            >
              <AccordionTrigger className='text-left hover:no-underline'>
                <div className='flex items-center gap-3'>
                  <div className='bg-accent flex h-8 w-8 items-center justify-center rounded-full'>
                    <Icon className='h-4 w-4' />
                  </div>
                  <span className='text-base font-medium md:text-lg'>
                    {question}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className='text-muted-foreground pl-11 text-sm leading-relaxed md:text-base'>
                {answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
