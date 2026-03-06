import { useTheme } from 'next-themes';
import Image from 'next/image';

export const Logo = ({ useWhiteLogo }: { useWhiteLogo?: boolean }) => {
  const theme = useWhiteLogo ? { theme: 'dark' } : useTheme();

  return (
    <Image
      src={
        theme.theme === 'dark'
          ? '/logos/white.logo.png'
          : '/logos/black.logo.png'
      }
      width={165}
      height={165}
      alt='Logo.png'
      className='w-28 sm:w-42'
    />
  );
};
