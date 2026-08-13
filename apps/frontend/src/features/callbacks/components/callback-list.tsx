'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { CalendarClock, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface CallbackEntry {
  id: string;
  userId: string;
  organizationId: string | null;
  contactId: string;
  callId: string | null;
  campaignLeadId: string | null;
  scheduledAt: string;
  note: string | null;
  status: string;
  completedAt: string | null;
  contact: {
    id: string;
    name: string | null;
    phoneNumber: string;
    company: string | null;
  };
  campaignLead: {
    id: string;
    campaignId: string;
    campaign: { id: string; name: string };
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  due: 'bg-orange-100 text-orange-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  missed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-700'
};

export function CallbackList() {
  const api = useApi();
  const t = useTranslations('calls.callbacks.list');
  const [callbacks, setCallbacks] = useState<CallbackEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCallbacks();
  }, []);

  async function loadCallbacks() {
    setLoading(true);
    try {
      const data = await api.get<{ data: CallbackEntry[] }>('/callbacks');
      setCallbacks(data.data);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id: string) {
    try {
      await api.patch(`/callbacks/${id}/cancel`);
      await loadCallbacks();
    } catch {
      // handled
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className='space-y-2'>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className='h-12 w-full' />
            ))}
          </div>
        ) : callbacks.length === 0 ? (
          <div className='flex flex-col items-center py-12 text-center'>
            <CalendarClock className='text-muted-foreground mb-4 h-12 w-12' />
            <h3 className='text-lg font-semibold'>{t('emptyTitle')}</h3>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t('emptyDescription')}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.contact')}</TableHead>
                <TableHead className='hidden md:table-cell'>
                  {t('columns.campaign')}
                </TableHead>
                <TableHead>{t('columns.scheduled')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead className='hidden sm:table-cell'>
                  {t('columns.note')}
                </TableHead>
                <TableHead className='w-[60px]'></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {callbacks.map((cb) => (
                <TableRow key={cb.id}>
                  <TableCell>
                    <div>
                      <div className='font-medium'>
                        {cb.contact.name || t('unknown')}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {cb.contact.phoneNumber}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className='hidden md:table-cell'>
                    {cb.campaignLead?.campaign?.name || '—'}
                  </TableCell>
                  <TableCell>
                    {new Date(cb.scheduledAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant='secondary'
                      className={STATUS_COLORS[cb.status] || ''}
                    >
                      {t(`statuses.${cb.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className='hidden sm:table-cell'>
                    <span className='text-muted-foreground line-clamp-1 text-sm'>
                      {cb.note || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {(cb.status === 'scheduled' || cb.status === 'due') && (
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => handleCancel(cb.id)}
                        title={t('cancel')}
                      >
                        <X className='text-muted-foreground h-4 w-4' />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
