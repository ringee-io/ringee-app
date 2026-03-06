'use client';

import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ringee/frontend-shared/components/ui/tabs';
import { SignIn, SignUp, useAuth } from '@clerk/nextjs';
import { useAuthModalStore } from './auth-modal.store';

export function AuthModal() {
  const { isOpen, activeTab, closeModal, setTab } = useAuthModalStore();
  const { isSignedIn } = useAuth();

  // Auto-close when user signs in
  useEffect(() => {
    if (isSignedIn && isOpen) {
      closeModal();
    }
  }, [isSignedIn, isOpen, closeModal]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className='max-w-md p-0 overflow-hidden'>
        <DialogHeader className='sr-only'>
          <DialogTitle>
            {activeTab === 'sign-in' ? 'Sign In' : 'Sign Up'}
          </DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setTab(v as 'sign-in' | 'sign-up')}
          className='w-full'
        >
          <TabsList className='grid w-full grid-cols-2 rounded-none border-b bg-transparent h-12'>
            <TabsTrigger
              value='sign-in'
              className='rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary'
            >
              Sign In
            </TabsTrigger>
            <TabsTrigger
              value='sign-up'
              className='rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary'
            >
              Sign Up
            </TabsTrigger>
          </TabsList>

          <div className='p-6'>
            <TabsContent value='sign-in' className='mt-0'>
              <SignIn
                routing='hash'
                signUpUrl='#sign-up'
                forceRedirectUrl='/'
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    card: 'shadow-none p-0 w-full',
                    headerTitle: 'hidden',
                    headerSubtitle: 'hidden',
                    socialButtonsBlockButton: 'w-full',
                    formButtonPrimary:
                      'bg-primary hover:bg-primary/90 text-primary-foreground'
                  }
                }}
              />
            </TabsContent>

            <TabsContent value='sign-up' className='mt-0'>
              <SignUp
                routing='hash'
                signInUrl='#sign-in'
                forceRedirectUrl='/'
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    card: 'shadow-none p-0 w-full',
                    headerTitle: 'hidden',
                    headerSubtitle: 'hidden',
                    socialButtonsBlockButton: 'w-full',
                    formButtonPrimary:
                      'bg-primary hover:bg-primary/90 text-primary-foreground'
                  }
                }}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
