import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

export const GooglePlayButton = () => (
  <Tooltip>
    <TooltipTrigger asChild>
      <motion.a
        href='https://play.google.com/store/apps/details?id=io.ringee.twa'
        target='_blank'
        rel='noopener noreferrer'
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          'relative flex h-12 items-center justify-center overflow-hidden',
          'shadow-[0_0_20px_-5px_rgba(16,159,220,0.25)] transition-all duration-300 hover:shadow-[0_0_40px_-10px_rgba(16,159,220,0.35)]',
          'cursor-pointer'
        )}
      >
        <img
          src='https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png'
          alt='Get it on Google Play'
          className='pointer-events-none h-18 w-auto select-none'
        />
      </motion.a>
    </TooltipTrigger>
    <TooltipContent side='top' className='text-sm font-medium'>
      Goi to play store 🚀
    </TooltipContent>
  </Tooltip>
);

export const WhatsAppButton = () => (
  <Tooltip>
    <TooltipTrigger asChild>
      <motion.button
        type='button'
        disabled
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
        className={cn(
          'flex h-12 items-center gap-2 rounded-xl px-6 font-medium text-white transition-all duration-300',
          'cursor-not-allowed bg-[#25D366] opacity-90 shadow-[0_0_25px_-8px_rgba(37,211,102,0.7)] hover:bg-[#20ba59] hover:shadow-[0_0_40px_-10px_rgba(37,211,102,0.9)]'
        )}
        onClick={(e) => e.preventDefault()}
      >
        <svg
          xmlns='http://www.w3.org/2000/svg'
          viewBox='0 0 448 512'
          className='h-5 w-5 fill-current'
        >
          <path d='M380.9 97.1C339-5.2 217.5-30.2 129.2 37.7A195.9 195.9 0 0 0 0 199.8C0 307.5 86.6 400 195.7 400c34.3 0 67.1-8.8 95.9-25.3l105.7 27.7-28.7-103.4C392.6 266.4 400 232.2 400 199.8c0-37.9-11.2-74.5-31.1-102.7zM195.7 366.7c-89.2 0-161.7-71.6-161.7-159.6 0-42.4 17.1-82.6 47.3-111.7 60.4-56 158.4-48.3 214.2 18.4 15.2 18 25.5 39.3 29.8 62.6 4.2 22.8 1.8 46.5-7.2 68.2l-3.8 9.3 17.5 63.1-65.1-17.1-9.4 5.6c-24.7 14.6-52.9 22.2-81.6 22.2z' />
        </svg>
        Use in WhatsApp
      </motion.button>
    </TooltipTrigger>
    <TooltipContent side='top' className='text-sm font-medium'>
      Coming soon 🚀
    </TooltipContent>
  </Tooltip>
);

export const OpenInBrowserButton = () => (
  <Link href='/auth/sign-in'>
    <motion.div
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'flex h-12 items-center gap-2 rounded-xl px-6 font-medium text-white transition-all duration-300',
        'border border-white/10 bg-neutral-900/70 backdrop-blur-sm hover:bg-neutral-800/90',
        'shadow-[0_0_25px_-10px_rgba(255,255,255,0.1)] hover:shadow-[0_0_35px_-10px_rgba(255,255,255,0.2)]'
      )}
    >
      {/* <svg
        xmlns='http://www.w3.org/2000/svg'
        className='h-5 w-5'
        fill='none'
        viewBox='0 0 24 24'
        stroke='currentColor'
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth='2'
          d='M14 3h7v7m0 0L10 21l-7-7L21 3z'
        />
      </svg> */}

      Try a Free Call
      <ArrowUpRight className='h-5 w-5' />
    </motion.div>
  </Link>
);
