import Image from 'next/image';

// The logo renders at w-28 (112px) on mobile and sm:w-42 (168px) from the
// `sm` breakpoint up. Declaring this lets the optimizer ship a right-sized
// candidate instead of defaulting to the 384px srcset entry.
const LOGO_SIZES = '(min-width: 640px) 168px, 112px';

type LogoProps = {
  useWhiteLogo?: boolean;
  // Set on the above-the-fold navbar logo so Next emits a high-priority
  // preload (fetchpriority="high") for the LCP image instead of lazy-loading.
  priority?: boolean;
};

export const Logo = ({ useWhiteLogo, priority }: LogoProps) => {
  if (useWhiteLogo) {
    return (
      <Image
        src={'/logos/white.logo.png'}
        width={165}
        height={165}
        alt='Ringee'
        priority={priority}
        sizes={LOGO_SIZES}
        className='w-28 sm:w-42'
      />
    );
  }

  return (
    <>
      {/* Default theme is dark, so the white logo is the one painted first —
          it carries the preload priority. The black (light-theme) logo loads
          normally without competing for the preload slot. */}
      <Image
        src={'/logos/white.logo.png'}
        width={165}
        height={165}
        alt='Ringee'
        priority={priority}
        sizes={LOGO_SIZES}
        className='hidden w-28 sm:w-42 dark:block'
      />

      <Image
        src={'/logos/black.logo.png'}
        width={165}
        height={165}
        alt='Ringee'
        sizes={LOGO_SIZES}
        className='w-28 sm:w-42 dark:hidden'
      />
    </>
  );
};
