import { Metadata } from 'next';
import SignInViewPage from '@/features/auth/components/sign-in-view';

export const metadata: Metadata = {
  title: 'Sign In — Ringee',
  description: 'Log in to your Ringee account to make calls worldwide.'
};

export default function Page() {
  return <SignInViewPage />;
}
