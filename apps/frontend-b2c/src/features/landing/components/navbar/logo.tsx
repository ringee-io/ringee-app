"use client";

import { useTheme } from 'next-themes';
import Image from 'next/image';
import { useState, useEffect } from 'react';

export const Logo = ({ useWhiteLogo }: { useWhiteLogo?: boolean }) => {
  const [logo, setLogo] = useState('/logos/white.logo.png');
  const theme = useWhiteLogo ? { theme: 'dark' } : useTheme();

  useEffect(() => {
    setLogo(theme.theme === 'dark' ? '/logos/white.logo.png' : '/logos/black.logo.png');
  }, [theme]);

  return (
    <Image
      key={logo}
      src={logo}
      width={155}
      height={155}
      alt='Logo.png'
      className='w-24 sm:w-36'
    />
  );
};
