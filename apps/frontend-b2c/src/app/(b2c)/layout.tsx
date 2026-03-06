import KBar from '@ringee/frontend-shared/components/kbar';
import { B2CLayout } from '@/components/layout/b2c-layout';
import { DialerShortcutView } from '@/features/calls/components/dialer.shortcut.view';
import { cookies } from 'next/headers';

export default async function B2CRouteLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const defaultDialerOpen =
    cookieStore.get('quick_dial_state')?.value === 'true';

  return (
    <KBar>
      <>
        <div className='container mx-auto max-w-7xl px-4 py-6 flex-1 h-screen'>
          <div className='flex gap-6 h-full'>
            <div className='flex-1 min-w-0'>{children}</div>
            <DialerShortcutView defaultOpen={defaultDialerOpen} />
          </div>
        </div>
      </>
    </KBar>
  );
}
