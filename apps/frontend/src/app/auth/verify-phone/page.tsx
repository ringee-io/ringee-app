import type { Metadata } from 'next';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Verify your phone number — Ringee',
  robots: { index: false, follow: false }
};

export default async function VerifyPhonePage() {
  const user = await currentUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  redirect('/auth/sign-up/continue');
}
