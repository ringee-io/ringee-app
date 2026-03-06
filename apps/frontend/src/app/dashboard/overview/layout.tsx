import PageContainer from '@/components/layout/page-container';
import { DashboardHeader } from '@/features/overview/components/dashboard-header';
import React from 'react';

export const metadata = {
  title: 'Dashboard — Manage Calls, Numbers & Contacts | Ringee',
  description:
    'Access your Ringee dashboard to manage calls, contacts, numbers, and analytics. Monitor your sales performance and communication metrics in one unified workspace.'
};

export default async function OverViewLayout({
  sales,
  pie_stats,
  bar_stats,
  area_stats,
  ovcards,
}: {
  sales: React.ReactNode;
  pie_stats: React.ReactNode;
  bar_stats: React.ReactNode;
  area_stats: React.ReactNode;
  ovcards: React.ReactNode;
}) {
  return (
    <PageContainer>
      <div className='flex flex-1 flex-col space-y-2'>
        <DashboardHeader />

        {ovcards}

        <div className='mb-20 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7'>
          <div className='col-span-4'>{bar_stats}</div>
          <div className='col-span-4 md:col-span-3'>
            {sales}
          </div>
          <div className='col-span-4'>{area_stats}</div>
          <div className='col-span-4 md:col-span-3'>{pie_stats}</div>
        </div>
      </div>
    </PageContainer>
  );
}
