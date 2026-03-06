import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { IconBrandReddit, IconBrandTwitter } from '@tabler/icons-react';
import Link from 'next/link';
import { Logo } from './navbar/logo';

const footerLinks = [
  {
    title: 'Features',
    href: '#features'
  },
  {
    title: 'Pricing',
    href: '#pricing'
  },
  {
    title: 'FAQ',
    href: '#faq'
  },
  {
    title: 'Comparison',
    href: '#comparison'
  },
  {
    title: 'Blog',
    href: '/blog'
  },
  {
    title: 'Privacy',
    href: '/privacy'
  },
  {
    title: 'Terms',
    href: '/terms'
  }
];

const Footer = () => {
  return (
    <footer className='dark bg-background text-foreground mt-40 mb-10 dark:border-t'>
      <div className='mx-auto max-w-screen-xl px-0 sm:px-6'>
        <div className='flex flex-col items-start justify-between gap-x-8 gap-y-10 px-6 py-12 sm:flex-row xl:px-0'>
          <div>
            <Logo />

            <ul className='mt-6 flex flex-wrap items-center gap-4'>
              {footerLinks.map(({ title, href }) => (
                <li key={title}>
                  <Link
                    href={href}
                    className='text-muted-foreground hover:text-foreground'
                  >
                    {title}
                  </Link>
                </li>
              ))}
            </ul>

          </div>

          <div>
            <h6 className='font-semibold mb-2'>Featured on: </h6>
            <div className='flex items-center gap-3'>
              <a
                href='https://www.producthunt.com/products/ringee-io?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-ringee-io'
                target='_blank'
                rel='noopener noreferrer'
              >
                <img
                  alt='Ringee.io - Call. Connect. Close. Instantly - Calls to 180+ countries | Product Hunt'
                  src='https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1037764&theme=neutral&t=1766986013601'
                  className='h-8 w-auto'
                />
              </a>

              <a
                href='https://startupfa.me/s/ringee?utm_source=www.ringee.io'
                target='_blank'
              >
                <img
                  src='https://startupfa.me/badges/featured-badge-small.webp'
                  alt='Ringee - Featured on Startup Fame'
                  className='h-8 w-auto'
                />
              </a>

              <a href='https://www.tinylaunch.com/launch/7675' target='_blank' rel='noopener'>
                <img
                  src='https://tinylaunch.com/tinylaunch_badge_3.svg'
                  alt='TinyLaunch Badge'
                  className='h-8 w-auto'
                />
              </a>
            </div>
          </div>

          {/* Subscribe Newsletter */}
          {/* <div className='w-full max-w-xs'>
            <h6 className='font-semibold'>Stay up to date</h6>
            <form className='mt-6 flex items-center gap-2'>
              <Input type='email' placeholder='Enter your email' />
              <Button>Subscribe</Button>
            </form>
          </div> */}
        </div>
        <Separator />
        <div className='flex flex-col-reverse items-center justify-between gap-x-2 gap-y-5 px-6 py-8 sm:flex-row xl:px-0'>
          {/* Copyright */}
          <span className='text-muted-foreground text-center sm:text-start'>
            &copy; {new Date().getFullYear()}{' '}
            <Link href='/' target='_blank'>
              Ringee
            </Link>
            . All rights reserved.
          </span>

          <div className='text-muted-foreground flex items-center gap-5'>
            <Link href='https://x.com/edisonjpp' target='_blank'>
              <IconBrandTwitter className='h-5 w-5' />
            </Link>
            <Link href='https://www.reddit.com/r/ringee/' target='_blank'>
              <IconBrandReddit className='h-5 w-5' />
            </Link>
            {/* <Link href='#' target='_blank'>
              <TwitchIcon className='h-5 w-5' />
            </Link>
            <Link href='#' target='_blank'>
              <GithubIcon className='h-5 w-5' />
            </Link> */}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
