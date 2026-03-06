import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { BarGraph } from '@/features/overview/components/bar-graph';
import { RecentSales } from '@/features/overview/components/recent-sales';
import { AreaGraph } from '@/features/overview/components/area-graph';
import { PieGraph } from '@/features/overview/components/pie-graph';
import { OverviewCards } from '@/features/overview/components/overview.cards';
import { OverviewCardsSkeleton } from '@/features/overview/components/overview.cards.skeleton';
import { Suspense } from 'react';
import PageContainer from '@/components/layout/page-container';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import LandingPageView from '@/features/landing/components/landing.page.view';
import { SidebarInset, SidebarProvider } from '@ringee/frontend-shared/components/ui/sidebar';
import KBar from '@ringee/frontend-shared/components/kbar';
import Header from '@/components/layout/header';
import AppMainSidebar from '@/components/layout/app.main.sidebar';
import { DialerShortcutView } from '@/features/calls/components/dialer.shortcut.view';

export default async function Page() {
  const { userId } = await auth();

  if (userId) {
    return redirect('/dashboard/overview');
  } else {
    // return redirect('/auth/sign-in');
    const params = {
      mock: true
    };

    const data = await apiServer.get('/dashboard/overview', params);
    const pieData = await apiServer.get('/dashboard/calls-by-period', params);
    const areaData = await apiServer.get('/dashboard/calls-per-month', params);
    const barData = await apiServer.get('/dashboard/calls-per-day', params);
    const recentCalls = await apiServer.get('/dashboard/recent-calls', params);

    return (
      <KBar>
        <SidebarProvider defaultOpen>
          <AppMainSidebar hiddenBottomNav useMock />
          <SidebarInset>
            <Header useMock={true} />
            <div className='flex gap-4'>
              <PageContainer>
                <div className='flex flex-1 flex-col space-y-2'>
                  <div className='flex items-center justify-between space-y-2'>
                    <h2 className='text-2xl font-bold tracking-tight'>
                      Hi, Welcome 👋
                    </h2>
                  </div>

                  <Suspense fallback={<OverviewCardsSkeleton />}>
                    <OverviewCards useMock={true} />
                  </Suspense>

                  <div className='mb-20 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7'>
                    <div className='col-span-4'>
                      <BarGraph data={barData} />
                    </div>
                    <div className='col-span-4 md:col-span-3'>
                      {/* sales arallel routes */}
                      <RecentSales data={recentCalls} />
                    </div>
                    <div className='col-span-4'>
                      <AreaGraph data={areaData} growthRate={data.growthRate} />
                    </div>
                    <div className='col-span-4 md:col-span-3'>
                      <PieGraph
                        data={pieData.data}
                        rangeStart={new Date(pieData.rangeStart)}
                        rangeEnd={new Date(pieData.rangeEnd)}
                      />
                    </div>
                  </div>
                </div>

                <LandingPageView />
              </PageContainer>
              <DialerShortcutView defaultOpen useMock={true} />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </KBar>
    );
  }
}
