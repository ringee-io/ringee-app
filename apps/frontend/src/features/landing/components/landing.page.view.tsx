'use client';

import { useEffect, useState } from 'react';
import LandingContent from './landing.content';

export default function LandingPageView({ full = false }: { full?: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {visible && (
        <div className='fadeIn fixed inset-0 z-40 bg-black/50'>
          <div className='animate-fadeIn fixed inset-0 z-50 mt-auto flex h-[87vh] items-center justify-center'>
            <div className='animate-scaleIn h-[100vh] w-[100vw] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-2xl md:w-[98vw] lg:w-[88vw] xl:w-[75vw] dark:border-neutral-800 dark:bg-neutral-900'>
              <LandingContent />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
