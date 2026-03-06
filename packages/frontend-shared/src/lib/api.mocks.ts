export const apiMocks = {
  '/dashboard/overview': async () => ({
    total: 350,
    answered: 270,
    missed: 80,
    averageDuration: 180,
    durationChange: 12.19,
    weeklyGrowth: 12.5,
    growthRate: 6.8,
    answerRate: 77.1,
    missedRate: 22.9
  }),
  '/dashboard/calls-per-day': async () => [
    { date: '2025-10-01', answered: 8, missed: 2 },
    { date: '2025-10-02', answered: 12, missed: 1 },
    { date: '2025-10-03', answered: 15, missed: 3 },
    { date: '2025-10-04', answered: 9, missed: 2 },
    { date: '2025-10-05', answered: 13, missed: 4 },
    { date: '2025-10-06', answered: 11, missed: 3 },
    { date: '2025-10-07', answered: 14, missed: 2 }
  ],
  '/dashboard/calls-per-month': async () => [
    { month: 'May', answered: 120, missed: 30 },
    { month: 'Jun', answered: 150, missed: 45 },
    { month: 'Jul', answered: 200, missed: 60 },
    { month: 'Aug', answered: 180, missed: 40 },
    { month: 'Sep', answered: 220, missed: 55 },
    { month: 'Oct', answered: 260, missed: 50 }
  ],
  '/dashboard/calls-by-period': async () => ({
    data: [
      { period: 'morning', total: 120 },
      { period: 'afternoon', total: 90 },
      { period: 'evening', total: 60 },
      { period: 'night', total: 30 }
    ],
    rangeStart: '2025-05-01T00:00:00Z',
    rangeEnd: '2025-10-30T00:00:00Z'
  }),
  '/dashboard/recent-calls': async () => [
    {
      id: 'call_01',
      fromNumber: '+18095551234',
      toNumber: '+18095557654',
      totalCost: 0.25,
      durationSeconds: 65,
      status: 'completed',
      createdAt: '2025-10-29T10:15:00Z',
      contact: { name: 'John Doe', email: 'john@example.com' }
    },
    {
      id: 'call_02',
      fromNumber: '+18095551234',
      toNumber: '+18095559876',
      totalCost: 0.18,
      durationSeconds: 43,
      status: 'failed',
      createdAt: '2025-10-28T16:40:00Z'
    },
    {
      id: 'call_03',
      fromNumber: '+18095551234',
      toNumber: '+18095551212',
      totalCost: 0.32,
      durationSeconds: 92,
      status: 'completed',
      createdAt: '2025-10-28T08:25:00Z',
      contact: { name: 'Bob Johnson', email: 'bob@example.com' }
    },
    {
      id: 'call_04',
      fromNumber: '+18095551234',
      toNumber: '+18095558787',
      totalCost: 0.22,
      durationSeconds: 55,
      status: 'completed',
      createdAt: '2025-10-27T18:50:00Z',
      contact: { name: 'Emily Davis', email: 'emily@example.com' }
    },
    {
      id: 'call_05',
      fromNumber: '+18095551234',
      toNumber: '+18095556789',
      totalCost: 0.29,
      durationSeconds: 78,
      status: 'failed',
      createdAt: '2025-10-26T20:15:00Z',
      contact: { name: 'Carlos Martínez', email: 'carlos@example.com' }
    }
  ],
  '/credits/balance': async () => ({
    balance: 156,
    freeCallTrial: false
  })
};
