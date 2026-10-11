'use client';

// TEMPORARY review check — delete with its .next output when done.
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ClerkAppProvider from '@/components/layout/clerk-app-provider';
import { CampaignsView } from '@/features/calls/components/campaigns/campaigns-view';
import { UnlockCampaignsButton } from '@/features/calls/components/campaigns/unlock-campaigns-button';
import { useTelnyxStore } from '@/features/calls/store/telnyx.store';

const now = new Date().toISOString();
const CAMPAIGNS = [
  {
    id: 'c1',
    name: 'Fintech founders — NYC',
    description: null,
    status: 'active',
    dialerMode: 'progressive',
    callerIdId: null,
    numberPurchasedId: null,
    externalNumberId: null,
    rotationNumberIds: [],
    maxAttempts: 3,
    timezone: 'America/New_York',
    workStartMin: 540,
    workEndMin: 1020,
    workDays: [1, 2, 3, 4, 5],
    wrapUpTimeSec: 30,
    retryDelayMin: 60,
    userId: 'u1',
    organizationId: 'o1',
    createdAt: now,
    updatedAt: now,
    _count: { leads: 248 }
  }
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

if (typeof window !== 'undefined' && !(window as any).__zzPatched) {
  (window as any).__zzPatched = true;
  const realFetch = window.fetch.bind(window);
  let subscriptionReads = 0;
  let deletes = 0;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    (window as any).__zzCalls = [
      ...((window as any).__zzCalls ?? []),
      `${method} ${url.replace(/^.*\/api/, '')}`
    ];
    if (url.includes('/api/subscriptions/available')) {
      subscriptionReads += 1;
      return subscriptionReads === 1
        ? json({ message: 'boom' }, 500)
        : json({ hasAvailable: false });
    }
    if (/\/api\/campaigns(\?|$)/.test(url)) {
      return json({
        data: CAMPAIGNS,
        meta: { total: 1, page: 1, limit: 100, totalPages: 1 }
      });
    }
    if (url.endsWith('/api/dialer/sessions') && method === 'POST') {
      await new Promise((r) => setTimeout(r, 3000));
      return json({
        id: 's1',
        status: 'ready',
        startedAt: now,
        dialerMode: 'progressive'
      });
    }
    if (url.includes('/api/dialer/sessions/s1') && method === 'DELETE') {
      deletes += 1;
      return deletes < 3 ? json({ message: 'down' }, 503) : json({});
    }
    if (url.includes('/api/dialer/')) return json({});
    return realFetch(input, init);
  };
}

function Inner() {
  const view = useSearchParams().get('view');
  useEffect(() => {
    const id = setTimeout(
      () => useTelnyxStore.setState({ status: 'registered' } as any),
      600
    );
    return () => clearTimeout(id);
  }, []);
  return (
    <div className='mx-auto w-full max-w-[1180px] p-4 md:px-6'>
      {view === 'unlock' ? (
        <div className='flex justify-end'>
          <UnlockCampaignsButton />
        </div>
      ) : (
        <CampaignsView />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <ClerkAppProvider>
      <Inner />
    </ClerkAppProvider>
  );
}
