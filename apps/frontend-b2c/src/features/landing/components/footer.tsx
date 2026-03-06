import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import {
  IconBrandLinkedin,
  IconBrandReddit,
  IconBrandX,
  IconLock
} from '@tabler/icons-react';
import Link from 'next/link';
import { Logo } from './navbar/logo';

const footerLinks = [
  {
    title: 'Product',
    items: [
      { label: 'Features', href: '/features' },
      { label: 'Virtual Numbers', href: '/features/virtual-numbers' },
      { label: 'Call Recording', href: '/features/call-recording' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Call Rates', href: '/rate' },
      { label: 'Buy Numbers', href: '/buy-numbers' }
    ]
  },
  {
    title: 'Personal Use',
    items: [
      { label: 'Call Family Abroad', href: '/use-cases/calling-family' },
      { label: 'International Travelers', href: '/use-cases/international-travelers' },
      { label: 'Call Banks & Offices', href: '/use-cases/calling-banks-offices' },
      { label: 'Call Germany', href: '/use-cases/call-germany' },
      { label: 'Call Russia', href: '/use-cases/call-russia' },
      { label: 'Call Mexico', href: '/use-cases/call-mexico' },
      { label: 'Call India', href: '/use-cases/call-india' }
    ]
  },
  {
    title: 'For Business',
    items: [
      { label: 'For Freelancers', href: '/use-cases/freelancers' },
      { label: 'For Sales Teams', href: '/use-cases/sales-teams' },
      { label: 'For Real Estate', href: '/use-cases/real-estate' },
      { label: 'For Call Centers', href: '/use-cases/small-call-centers' },
      { label: 'Ringee for Teams', href: 'https://www.ringee.io', external: true }
    ]
  },
  {
    title: 'Resources',
    items: [
      { label: 'Comparisons', href: '/compare' },
      { label: 'Guides', href: '/guides' },
      { label: 'VoIP Glossary', href: '/guides/voip-glossary' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Blog', href: 'https://blog.ringee.io' }
    ]
  },
  {
    title: 'Company',
    items: [
      { label: 'Trust & Security', href: '/trust' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Use', href: '/terms' },
    ]
  }
];



const Footer = () => {
  return (
    <footer className='bg-black text-white py-20 border-t border-white/10'>
      <div className='container mx-auto max-w-7xl px-4'>
        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-8 mb-20'>
          <div className='flex flex-col gap-6 md:col-span-1'>
             <div className='flex flex-col gap-4'>
               <Logo useWhiteLogo />
               <p className='text-sm text-gray-400 leading-relaxed'>
                 The modern phone system for forward-thinking teams. 
                 Call, text, and manage contacts worldwide.
               </p>
             </div>
             
             <Link 
               href="https://stripe.com" 
               target="_blank" 
               rel="noopener noreferrer"
               className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors w-fit group"
             >
               <div className="bg-[#635BFF] p-1 rounded">
                 <IconLock className="h-3 w-3 text-white" />
               </div>
               <span className="group-hover:underline decoration-gray-500 underline-offset-4 decoration-1">
                 Secure Payments by Stripe
               </span>
             </Link>
          </div>

          {footerLinks.map((column) => (
            <div key={column.title} className='flex flex-col gap-4'>
              <h3 className='font-semibold text-gray-400 text-sm uppercase tracking-wider'>
                {column.title}
              </h3>
              <ul className='flex flex-col gap-3'>
                {column.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      target={item.href.startsWith('http') ? '_blank' : undefined}
                      rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className='text-sm text-gray-400 font-medium hover:text-primary transition-colors'
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className='bg-white/10 mb-8' />

        <div className='flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-gray-400'>
          <div className='flex flex-col md:flex-row md:items-center gap-1 md:gap-4 text-center md:text-left'>
            <p>&copy; {new Date().getFullYear()} PadillaCore, LLC. All Rights Reserved.</p>
            <span className="hidden md:inline text-gray-600">|</span>
            <p>Phone by Ringee.io® is the property of PadillaCore, LLC.</p>
          </div>

          <div className='flex items-center gap-6'>
            <Link 
              href='https://x.com/edisonjpp' 
              target="_blank" 
              rel="noopener noreferrer"
              className='hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full'
            >
              <IconBrandX className='h-5 w-5' />
              <span className="sr-only">X (Twitter)</span>
            </Link>
            <Link 
              href='https://www.linkedin.com/company/ringee-io/?viewAsMember=true' 
              target="_blank" 
              rel="noopener noreferrer"
              className='hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full'
            >
              <IconBrandLinkedin className='h-5 w-5' />
              <span className="sr-only">LinkedIn</span>
            </Link>
            <Link 
              href='https://www.reddit.com/r/ringee/' 
              target="_blank" 
              rel="noopener noreferrer"
              className='hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full'
            >
              <IconBrandReddit className='h-5 w-5' />
              <span className="sr-only">Reddit</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
