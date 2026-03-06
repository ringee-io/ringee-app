import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, X } from 'lucide-react';
import Link from 'next/link';
import { B2CLayout } from '@/components/layout/b2c-layout';

const features = [
  'Virtual Phone Numbers',
  'Browser Calling',
  'International Calling',
  'Call Recording',
  'Voicemail',
  'Pay as you go',
  'Contact Management',
  'No Hardware Required',
  'Instant Setup'
];

const competitors = [
  {
    name: 'Phone by Ringee.io',
    price: 'Pay as you go',
    features: features.reduce((acc, feature) => ({ ...acc, [feature]: true }), {}),
    highlight: true
  },
  {
    name: 'Skype',
    price: 'Subscription / Credits',
    features: {
      'Virtual Phone Numbers': true,
      'Browser Calling': true,
      'International Calling': true,
      'Call Recording': true,
      'Voicemail': true,
      'Pay as you go': true,
      'Contact Management': true,
      'No Hardware Required': true,
      'Instant Setup': true
    },
    highlight: false
  },
  {
    name: 'Google Voice',
    price: 'Free (Personal) / Paid',
    features: {
      'Virtual Phone Numbers': true,
      'Browser Calling': true,
      'International Calling': true,
      'Call Recording': false,
      'Voicemail': true,
      'Pay as you go': false,
      'Contact Management': true,
      'No Hardware Required': true,
      'Instant Setup': false
    },
    highlight: false
  }
];

export default function ComparisonsPage() {
  return (
    <>
      <div className='container mx-auto max-w-7xl py-20 px-4'>
        <div className='text-center mb-16'>
          <h1 className='text-4xl font-bold tracking-tight mb-4'>
            Compare Phone by Ringee.io
          </h1>
          <p className='text-muted-foreground text-lg max-w-2xl mx-auto'>
            See how Phone by Ringee.io stacks up against other popular calling solutions.
            We feature crystal-clear quality, lower rates, and better enterprise features.
          </p>
        </div>

        <div className='overflow-x-auto'>
          <table className='w-full border-collapse'>
            <thead>
              <tr>
                <th className='p-4 text-left min-w-[200px]'>Features</th>
                {competitors.map((comp) => (
                  <th
                    key={comp.name}
                    className={`p-4 text-center min-w-[180px] ${
                      comp.highlight ? 'bg-primary/5 rounded-t-lg' : ''
                    }`}
                  >
                    <div className='text-xl font-bold mb-2'>{comp.name}</div>
                    <div className='text-sm text-muted-foreground font-normal'>
                      {comp.price}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((feature, index) => (
                <tr key={feature} className='border-b border-border/50'>
                  <td className='p-4 font-medium text-sm'>{feature}</td>
                  {competitors.map((comp) => (
                    <td
                      key={`${comp.name}-${feature}`}
                      className={`p-4 text-center ${
                        comp.highlight ? 'bg-primary/5' : ''
                      } ${
                        index === features.length - 1 && comp.highlight
                          ? 'rounded-b-lg'
                          : ''
                      }`}
                    >
                      {comp.features[feature as keyof typeof comp.features] ? (
                        <Check className='h-5 w-5 text-green-500 mx-auto' />
                      ) : (
                        <X className='h-5 w-5 text-red-500 mx-auto' />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className='mt-16 text-center'>
          <div className='flex flex-col items-center gap-6 p-8 rounded-2xl bg-primary/5 border border-primary/10'>
            <h2 className='text-2xl font-bold'>Ready to make the switch?</h2>
            <p className='text-muted-foreground max-w-xl'>
              Join thousands of users who have already switched to Ringee for better quality
              and lower rates. Setup takes less than 2 minutes.
            </p>
            <div className='flex gap-4'>
              <Link href='/sign-up'>
                <Button size='lg' className='gap-2'>
                  <Phone className='h-4 w-4' />
                  Try a free call
                </Button>
              </Link>
              <Link href='/rate'>
                <Button variant='outline' size='lg'>
                  Check Rates
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

