import Image from 'next/image';

export const Logo = ({ useWhiteLogo }: { useWhiteLogo?: boolean }) => {
  if(useWhiteLogo) {
    return (
      <Image
        src={'/logos/white.logo.png'}
        width={165}
        height={165}
        alt='Logo.png'
        className='w-28 sm:w-42'
      />
    );
  }

  return (
    <>
      <Image
        src={'/logos/white.logo.png'}
        width={165}
        height={165}
        alt='Logo.png'
        className='w-28 sm:w-42 hidden dark:block'
      />

      <Image
        src={'/logos/black.logo.png'}
        width={165}
        height={165}
        alt='Logo.png'
        className='w-28 sm:w-42 dark:hidden'
      />
    </>
  );
};
