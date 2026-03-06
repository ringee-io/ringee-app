'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Mic, Sparkles, X, ArrowRight } from 'lucide-react';
import { useOnboarding } from '../hooks/use.onboarding';
import { cn } from '@ringee/frontend-shared/lib/utils';

/**
 * Modal that appears when the user hasn't made their first call yet.
 * Encourages them to make a call and shows them the recording button.
 */
export function FirstCallModal() {
  const router = useRouter();
  const { status, isLoading, isStepComplete } = useOnboarding();
  const [isOpen, setIsOpen] = useState(false);
  const [hasDismissed, setHasDismissed] = useState(false);

  // Show modal when first_call step is not complete
  useEffect(() => {
    if (!isLoading && status && !isStepComplete('first_call') && !hasDismissed) {
      // Small delay to let the page load first
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, status, isStepComplete, hasDismissed]);

  const handleStartCall = () => {
    setIsOpen(false);
    router.push('/dashboard/call');
  };

  const handleDismiss = () => {
    setHasDismissed(true);
    setIsOpen(false);
  };

  // Don't render if loading or already completed
  if (isLoading || !status || isStepComplete('first_call')) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogContent className="sm:max-w-md md:max-w-[550px] p-0 overflow-hidden border-0 shadow-2xl bg-background/95 backdrop-blur-md">
        
        {/* Decorative gradient background opacity */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />

        <div className="p-6 relative z-10">
          <DialogHeader className="text-left mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 shadow-sm">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold tracking-tight">Your first call is on us</DialogTitle>
                  <p className="text-sm text-muted-foreground font-medium">
                    Make and record your first free call!
                  </p>
                </div>
              </div>
              {/* <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full -mt-2 -mr-2 opacity-70 hover:opacity-100"
                onClick={handleDismiss}
              >
                <X className="h-4 w-4" />
              </Button> */}
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Steps Container */}
            <div className="grid gap-4">
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-start gap-4 p-4 rounded-xl bg-muted/40 border border-border/40 hover:bg-muted/60 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 dark:bg-blue-500/20 shadow-sm">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1">Step 1: Enter a phone number</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Use the dial pad to enter any phone number you want to call. It works just like a normal phone.
                  </p>
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="flex items-start gap-4 p-4 rounded-xl bg-muted/40 border border-border/40 hover:bg-muted/60 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 dark:bg-rose-500/20 shadow-sm">
                  <Mic className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1">Step 2: Start recording</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                     Don't forget to click the record button once your call connects to save the conversation.
                  </p>
                </div>
              </motion.div>
            </div>

            {/* Recording visual hint */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="relative rounded-xl overflow-hidden border border-border shadow-lg group"
            >
              <div className="absolute top-3 left-3 z-10 px-2.5 py-1.5 bg-background/95 backdrop-blur rounded-md shadow-sm border border-border/50 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                <p className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wider">
                  Recording Button
                </p>
              </div>
              
              {/* Overlay gradient for depth */}
              <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent pointer-events-none" />
              
              <Image
                src="/start-recording-cap.png"
                alt="How to start recording"
                width={550}
                height={300}
                className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out"
                priority
              />
            </motion.div>

            {/* CTA buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="ghost"
                className="flex-1 text-muted-foreground hover:text-foreground"
                onClick={handleDismiss}
              >
                Maybe later
              </Button>
              <Button
                className="cursor-pointer flex-[2] gap-2 h-11 text-base shadow-primary/25 hover:shadow-primary/40 shadow-lg transition-all hover:scale-[1.02]"
                onClick={handleStartCall}
              >
                Start calling now
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

