import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function SettingsPage() {
  const { userId } = await auth();

  if (!userId) {
    return redirect('/auth/sign-in');
  } else {
    redirect('/dashboard/settings/overview');
  }
}
