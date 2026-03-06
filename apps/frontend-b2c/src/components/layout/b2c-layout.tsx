'use client';

import { usePathname } from 'next/navigation';
import { B2CHeader } from './b2c-header';
import Footer from '@/features/landing/components/footer';

interface B2CLayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
}

export function B2CLayout({
  children,
  showFooter = false
}: B2CLayoutProps) {
  const path = usePathname();

  const hideHeader = path === '/sign-in' || path === '/sign-up';

  return (
    <div className='min-h-screen flex flex-col bg-background'>
      {!hideHeader && <B2CHeader />}

      <main className='flex-1'>
        {children}
      </main>
      
      {showFooter && <Footer />}
    </div>
  );
}
