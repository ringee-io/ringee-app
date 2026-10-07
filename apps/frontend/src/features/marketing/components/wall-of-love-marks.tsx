import type { ComponentProps } from 'react';
import {
  IconBrandLinkedinFilled,
  IconBrandWhatsappFilled
} from '@tabler/icons-react';
import { Mail, Video } from 'lucide-react';

import { cn } from '@ringee/frontend-shared/lib/utils';
import type { WallSource } from '../content/wall-of-love';

// The networks' marks, in their own colours. Decorative: whatever carries one
// names the network in text as well.

export const NETWORK_NAMES: Record<Exclude<WallSource, 'video'>, string> = {
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  x: 'X',
  trustpilot: 'Trustpilot',
  email: 'Email'
};

export function StarShape(props: ComponentProps<'svg'>) {
  return (
    <svg aria-hidden viewBox='0 0 24 24' {...props}>
      <polygon
        fill='currentColor'
        points='12,1.6 14.58,9.55 22.94,9.55 16.18,14.46 18.76,22.4 12,17.49 5.24,22.4 7.82,14.46 1.06,9.55 9.42,9.55'
      />
    </svg>
  );
}

export function LinkedInMark({ className }: { className?: string }) {
  return (
    <IconBrandLinkedinFilled
      aria-hidden
      className={cn('h-5 w-5 text-[#0A66C2]', className)}
    />
  );
}

export function WhatsAppMark({ className }: { className?: string }) {
  return (
    <IconBrandWhatsappFilled
      aria-hidden
      className={cn('h-5 w-5 text-[#25D366]', className)}
    />
  );
}

export function XMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox='0 0 24 24' className={cn('h-4 w-4', className)}>
      <path
        fill='currentColor'
        d='M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'
      />
    </svg>
  );
}

export function TrustpilotMark({ className }: { className?: string }) {
  return <StarShape className={cn('h-5 w-5 text-[#00B67A]', className)} />;
}

/** Trustpilot's logo is the star and the word together. */
export function TrustpilotLogo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex items-center gap-1 text-[12px] font-semibold tracking-tight text-[#191919] dark:text-white',
        className
      )}
    >
      <TrustpilotMark className='h-4 w-4' />
      Trustpilot
    </span>
  );
}

/** The mark a card shows for its network, top right. */
export function SourceLogo({ source }: { source: WallSource }) {
  switch (source) {
    case 'linkedin':
      return <LinkedInMark />;
    case 'whatsapp':
      return <WhatsAppMark />;
    case 'x':
      return <XMark className='text-black dark:text-white' />;
    case 'trustpilot':
      return <TrustpilotLogo />;
    case 'email':
      return (
        <Mail
          aria-hidden
          className='h-5 w-5 text-black/45 dark:text-white/50'
        />
      );
    case 'video':
      return (
        <Video
          aria-hidden
          className='h-5 w-5 text-black/45 dark:text-white/50'
        />
      );
  }
}
