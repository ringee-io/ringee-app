'use client';

import { useState } from 'react';
import { X, Sparkles, Copy, Check } from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';

export default function PromoBanner() {
    const [isVisible, setIsVisible] = useState(true);
    const [copied, setCopied] = useState(false);
    const promoCode = 'RINGEE35';

    const handleCopyCode = async () => {
        await navigator.clipboard.writeText(promoCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isVisible) return null;

    return (
        <div className='relative overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500'>
            {/* Animated shimmer effect */}
            <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite] -translate-x-full' />

            <div className='relative flex items-center justify-center gap-2 px-4 py-2.5 text-white'>
                <Sparkles className='h-4 w-4 animate-pulse text-yellow-300' />

                <p className='text-center text-sm font-medium sm:text-base'>
                    <span className='hidden sm:inline'>🔥 Hot Deal: Use code </span>
                    <span className='sm:hidden'>🔥 Code </span>
                    <button
                        onClick={handleCopyCode}
                        className={cn(
                            'mx-1 inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 font-bold tracking-wider backdrop-blur-sm transition-all hover:bg-white/30',
                            'border border-white/30 cursor-pointer'
                        )}
                    >
                        {promoCode}
                        {copied ? (
                            <Check className='h-3 w-3 text-green-300' />
                        ) : (
                            <Copy className='h-3 w-3' />
                        )}
                    </button>
                    <span className='hidden sm:inline'> for </span>
                    <span className='font-bold text-yellow-300'>35% OFF</span>
                    <span className='hidden sm:inline'> your first purchase!</span>
                    <span className='ml-1 text-white/90'>• Ends Dec 31st</span>
                </p>

                <button
                    onClick={() => setIsVisible(false)}
                    className='absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/70 transition-colors hover:bg-white/20 hover:text-white cursor-pointer'
                    aria-label='Close banner'
                >
                    <X className='h-4 w-4' />
                </button>
            </div>
        </div>
    );
}
