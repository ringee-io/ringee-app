import { Metadata } from 'next';
import SignUpViewPage from '@/features/auth/components/sign-up-view';

export const metadata: Metadata = {
  title: 'Sign Up — Ringee',
  description: 'Create your Ringee account and start calling worldwide.'
};

export default function Page() {
  return <SignUpViewPage />;
}
