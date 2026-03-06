import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function Dashboard() {
  const { userId } = await auth();

  if (!userId) {
    return redirect('/sign-in');
  } else {
    redirect('/dashboard/overview');
  }
}
