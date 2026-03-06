'use client';

import { useAuth } from '@clerk/nextjs';
import { Phone, Zap, Globe, Shield, DollarSign } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Dialer } from '@/features/calls/components/dialer';
import { MockDialer } from '@/features/calls/components/mock-dialer';
import { B2CLayout } from '@/components/layout/b2c-layout';
// import Features from '@/features/landing/components/features';
// import FAQ from '@/features/landing/components/faq';
// import CTABanner from '@/features/landing/components/cta-banner';
// import CTABanner from '@/features/landing/components/cta-banner';

const HERO_FEATURES = [
  {
    icon: Zap,
    title: '50× Cheaper',
    description: 'Crystal-clear calls at a fraction of rates'
  },
  {
    icon: Globe,
    title: '180+ Countries',
    description: 'Call anywhere from your browser'
  },
  {
    icon: Shield,
    title: 'No Contracts',
    description: 'Pay as you go, cancel anytime'
  }
];

export default function B2CHomePage() {
  const { isSignedIn, isLoaded } = useAuth();

  return (
    <>
      {/* Hero Section */}
      <section className='relative overflow-hidden'>
        {/* Background gradient */}
        <div className='absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 pointer-events-none' />

        <div className='container mx-auto max-w-7xl px-4 py-12 md:py-20'>
          <div className='grid gap-8 lg:grid-cols-5 lg:gap-12 items-start'>
            {/* Left: Hero text - takes 3 columns */}
            <div className='lg:col-span-3 text-center lg:text-left'>
              <Badge className='mb-6 bg-primary/10 text-primary border-primary/20 inline-flex'>
                <span className='h-2 w-2 animate-pulse rounded-full bg-green-500 mr-2' />
                Pay as you go · No setup required
              </Badge>

              <h1 className='text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]'>
                Call anyone,{' '}
                <span className='text-primary'>anywhere</span>
              </h1>

              <p className='mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto lg:mx-0'>
                Make crystal-clear international calls from your browser or mobile. 
                50× cheaper than traditional phone rates. No apps needed on the other side.
              </p>

              <div className='mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start'>
                {isLoaded && !isSignedIn ? (
                  <>
                    <Link href='/sign-up'>
                      <Button size='lg' className='text-lg px-8 gap-2 w-full sm:w-auto'>
                        <Phone className='h-5 w-5' />
                        Try a free call
                      </Button>
                    </Link>
                    <Link href='/rate'>
                      <Button
                        size='lg'
                        variant='outline'
                        className='text-lg px-8 gap-2 w-full sm:w-auto'
                      >
                        <DollarSign className='h-5 w-5' />
                        See Rates
                      </Button>
                    </Link>
                  </>
                ) : (
                  <Link href='/call'>
                    <Button size='lg' className='text-lg px-8 gap-2'>
                      <Phone className='h-5 w-5' />
                      Go to Dialer
                    </Button>
                  </Link>
                )}
              </div>

              {/* Mini features */}
              <div className='mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6'>
                {HERO_FEATURES.map((feature) => (
                  <div
                    key={feature.title}
                    className='flex flex-col items-center lg:items-start gap-2'
                  >
                    <div className='flex items-center gap-2 text-primary'>
                      <feature.icon className='h-5 w-5' />
                      <span className='font-semibold'>{feature.title}</span>
                    </div>
                    <p className='text-sm text-muted-foreground text-center lg:text-left'>
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Quick Dial - takes 2 columns */}
            <div id='quick-dial' className='lg:col-span-2'>
              <div className='w-full max-w-sm mx-auto lg:mx-0 lg:ml-auto'>
                {/* <p className='text-center text-lg font-semibold mb-4 text-muted-foreground'>
                  Quick Dial
                </p>
                 */}
                {/* Use MockDialer for guests, real Dialer for authenticated users */}
                {isLoaded && isSignedIn ? (
                  <Dialer full />
                ) : (
                  <MockDialer full />
                )}
                
                {!isSignedIn && (
                  <p className='text-center text-sm text-muted-foreground mt-3'>
                    <Link href='/sign-up' className='text-primary hover:underline'>
                      Sign up free
                    </Link>{' '}
                    to start calling
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      {/* <Features /> */}

      {/* FAQ Section */}
      {/* <FAQ /> */}

      {/* CTA Banner */}
      {/* <CTABanner /> */}
    </>
  );
}
