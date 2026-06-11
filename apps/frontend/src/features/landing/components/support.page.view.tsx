'use client';

import Footer from '@/features/landing/components/footer';
import { Navbar } from '@/features/landing/components/navbar';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import {
  IconBrandGithub,
  IconBrandX,
  IconLifebuoy,
  IconMail,
  IconMessageCircle2,
  IconShieldCheck
} from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';

const SUPPORT_EMAIL = 'hello@ringee.io';

const screenshots = [
  {
    src: '/assets/app-screenshots/ios_1_1.png',
    caption: 'Track Every Callback'
  },
  { src: '/assets/app-screenshots/ios_1_2.png', caption: 'Calls That Matter' },
  {
    src: '/assets/app-screenshots/ios_1_3.png',
    caption: 'Key Calls — Save Them'
  },
  {
    src: '/assets/app-screenshots/ios_1_4.png',
    caption: 'Stay On Top of Every Call'
  },
  { src: '/assets/app-screenshots/ios_1_5.png', caption: 'Just Swipe to Call' }
];

const faqs = [
  {
    q: 'How do I make my first call?',
    a: 'Open Ringee, sign in with your account, then tap the Dialer tab. Enter a number in E.164 format (for example +14155552671) and tap the green call button. International calls connect instantly with crystal-clear HD voice.'
  },
  {
    q: 'How do callbacks work?',
    a: 'After every call you can schedule a callback for any time and date. Ringee tracks every callback under the Today tab and reminds you when it is due. You will never lose a lead again.'
  },
  {
    q: 'Can I import my contacts?',
    a: 'Yes. Go to the Contacts tab to add contacts manually, sync with your CRM, or import a CSV from the web dashboard at ringee.io.'
  },
  {
    q: 'My call quality is poor, what can I do?',
    a: 'Ringee uses WebRTC for voice. Make sure you are on a stable Wi-Fi or LTE/5G connection and grant microphone permission to the app. If problems persist, reach out to our support team at hello@ringee.io and include your device model and time of call.'
  },
  {
    q: 'How do I add credits or buy a phone number?',
    a: 'Open the Settings tab inside the app, then tap Billing. You can also manage credits, subscriptions, and purchased numbers from the web dashboard at ringee.io.'
  },
  {
    q: 'How do I delete my account?',
    a: 'Go to Settings → Account → Delete account. We will permanently remove your data within 30 days. You can also email hello@ringee.io and we will handle the deletion for you.'
  },
  {
    q: 'Is Ringee really open source?',
    a: 'Yes. The entire stack lives on GitHub at github.com/ringee-co and is self-hostable under the MIT license.'
  }
];

export default function SupportPageView() {
  return (
    <>
      <Navbar />

      <section className='relative mx-auto max-w-6xl px-6 pt-20 pb-12'>
        <div className='mx-auto max-w-3xl text-center'>
          <div className='bg-primary/10 text-primary mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium'>
            <IconLifebuoy className='h-4 w-4' />
            Ringee Support
          </div>
          <h1 className='text-foreground mb-4 text-4xl font-bold tracking-tight sm:text-5xl'>
            We are here to help
          </h1>
          <p className='text-muted-foreground mx-auto max-w-2xl text-lg'>
            Questions about Ringee for iOS? Trouble with a call, a number, or
            your subscription? Our team replies fast — usually within a few
            hours.
          </p>

          <div className='mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row'>
            <Button asChild size='lg' className='gap-2'>
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                <IconMail className='h-5 w-5' />
                {SUPPORT_EMAIL}
              </a>
            </Button>
            <Button asChild size='lg' variant='outline' className='gap-2'>
              <Link href='/' target='_blank' rel='noopener noreferrer'>
                Visit ringee.io
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className='mx-auto max-w-6xl px-6 py-10'>
        <div className='no-scrollbar -mx-6 flex snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-6 sm:gap-7'>
          {screenshots.map((shot) => (
            <div
              key={shot.src}
              className='shrink-0 basis-[260px] snap-center sm:basis-[300px]'
            >
              <div className='from-primary/15 via-background to-background relative overflow-hidden rounded-3xl border bg-gradient-to-b p-3 shadow-sm'>
                <div className='relative aspect-[9/19] overflow-hidden rounded-2xl'>
                  <Image
                    src={shot.src}
                    alt={shot.caption}
                    fill
                    sizes='(max-width: 768px) 260px, 300px'
                    className='object-cover'
                    priority={false}
                  />
                </div>
              </div>
              <p className='text-foreground mt-3 px-1 text-center text-sm font-medium'>
                {shot.caption}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className='mx-auto max-w-6xl px-6 py-12'>
        <div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
          <ContactCard
            icon={<IconMail className='h-5 w-5' />}
            title='Email support'
            description='The fastest way to reach us. We typically reply within a few hours, Monday to Friday.'
            actionLabel={SUPPORT_EMAIL}
            href={`mailto:${SUPPORT_EMAIL}`}
          />
          {/* <ContactCard
            icon={<IconMessageCircle2 className='h-5 w-5' />}
            title='Live chat'
            description='Need a hand right now? Use the chat bubble in the bottom-right corner of any Ringee page.'
            actionLabel='Open chat'
            href='/'
          /> */}
          <ContactCard
            icon={<IconBrandGithub className='h-5 w-5' />}
            title='Report a bug'
            description='Ringee is open source. File issues, request features, or send a pull request on GitHub.'
            actionLabel='github.com/ringee-io'
            href='https://github.com/ringee-io'
            external
          />
          <ContactCard
            icon={<IconShieldCheck className='h-5 w-5' />}
            title='Privacy & data'
            description='Read how we collect, store, and protect your data, or request the deletion of your account.'
            actionLabel='Privacy Policy'
            href='/privacy'
          />
          <ContactCard
            icon={<IconLifebuoy className='h-5 w-5' />}
            title='Billing & credits'
            description='Refunds, invoices, credit top-ups, and subscription changes — email us and we will sort it out.'
            actionLabel='Contact billing'
            href={`mailto:${SUPPORT_EMAIL}?subject=Billing%20help`}
          />
          {/* <ContactCard
            icon={<IconBrandX className='h-5 w-5' />}
            title='Follow updates'
            description='Product news, status updates, and changelogs land on our X account.'
            actionLabel='@ringeeio'
            href='https://x.com/ringeeio'
            external
          /> */}
        </div>
      </section>

      <section className='mx-auto max-w-4xl px-6 py-12'>
        <div className='mb-10 text-center'>
          <h2 className='text-foreground text-3xl font-bold tracking-tight sm:text-4xl'>
            Frequently asked questions
          </h2>
          <p className='text-muted-foreground mt-3'>
            Quick answers to the things people ask us most.
          </p>
        </div>

        <div className='space-y-6'>
          {faqs.map((item, idx) => (
            <div key={item.q}>
              <h3 className='text-foreground mb-2 text-lg font-semibold'>
                {item.q}
              </h3>
              <p className='text-muted-foreground leading-relaxed'>{item.a}</p>
              {idx < faqs.length - 1 && <Separator className='mt-6' />}
            </div>
          ))}
        </div>
      </section>

      <section className='mx-auto max-w-6xl px-6 py-16'>
        <div className='from-primary/10 via-background to-background border-primary/20 rounded-3xl border bg-gradient-to-br p-10 text-center sm:p-14'>
          <h2 className='text-foreground text-3xl font-bold tracking-tight sm:text-4xl'>
            Still need help?
          </h2>
          <p className='text-muted-foreground mx-auto mt-4 max-w-xl text-lg'>
            Send us a note. Include your account email, your device, and a short
            description of what is happening. We will take it from there.
          </p>
          <div className='mt-8'>
            <Button asChild size='lg' className='gap-2'>
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                <IconMail className='h-5 w-5' />
                Email {SUPPORT_EMAIL}
              </a>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}

function ContactCard({
  icon,
  title,
  description,
  actionLabel,
  href,
  external = false
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  external?: boolean;
}) {
  const linkProps = external
    ? { target: '_blank', rel: 'noopener noreferrer' as const }
    : {};
  return (
    <div className='bg-card hover:border-primary/40 group flex h-full flex-col rounded-2xl border p-6 transition-colors'>
      <div className='bg-primary/10 text-primary mb-4 flex h-10 w-10 items-center justify-center rounded-full'>
        {icon}
      </div>
      <h3 className='text-foreground mb-2 text-lg font-semibold'>{title}</h3>
      <p className='text-muted-foreground mb-5 text-sm leading-relaxed'>
        {description}
      </p>
      <div className='mt-auto'>
        <Link
          href={href}
          className='text-primary group-hover:text-primary inline-flex items-center text-sm font-medium hover:underline'
          {...linkProps}
        >
          {actionLabel} →
        </Link>
      </div>
    </div>
  );
}
