'use client';

import { useState } from 'react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import {
  TableActionCell,
  TableActionHead
} from '@ringee/frontend-shared/components/ui/table/table-action-column';
import { format } from 'date-fns';
import { useDeskPhones } from '../hooks/use-desk-phones';
import type { CreatedSipDevice, SipDevice, SipDeviceStatus } from '../types';
import { CreateDeskPhoneDialog } from './create-desk-phone-dialog';
import { CredentialsDialog } from './credentials-dialog';
import { DeviceActions } from './device-actions';
import { useTranslations } from 'next-intl';

const STATUS: Record<
  SipDeviceStatus,
  { className?: string; variant?: 'secondary' | 'outline' }
> = {
  registered: { className: 'bg-emerald-600 text-white' },
  pending: { className: 'bg-orange-500 text-white' },
  offline: { variant: 'secondary' },
  disabled: { variant: 'outline' },
  deleted: { variant: 'outline' }
};

function StatusBadge({ status }: { status: SipDeviceStatus }) {
  const t = useTranslations('calls.deskPhones');
  const s = STATUS[status] ?? STATUS.pending;
  return (
    <Badge variant={s.variant} className={s.className}>
      {t(`statuses.${status}`)}
    </Badge>
  );
}

export function DeskPhonesView() {
  const dp = useDeskPhones();
  const t = useTranslations('calls.deskPhones');
  const [createOpen, setCreateOpen] = useState(false);
  const [credentials, setCredentials] = useState<CreatedSipDevice | null>(null);

  const showCredentials = (result: CreatedSipDevice) => setCredentials(result);

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button onClick={() => setCreateOpen(true)}>{t('add')}</Button>
      </div>

      <Card>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.device')}</TableHead>
                <TableHead>{t('columns.number')}</TableHead>
                <TableHead>{t('columns.inbound')}</TableHead>
                <TableHead>{t('columns.outbound')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead>{t('columns.lastSeen')}</TableHead>
                <TableActionHead>
                  <span className='sr-only'>{t('columns.actions')}</span>
                </TableActionHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dp.loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className='h-6 w-full' />
                    </TableCell>
                  </TableRow>
                ))
              ) : dp.devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className='py-10 text-center'>
                    <p className='text-muted-foreground text-sm'>
                      {t('empty')}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                dp.devices.map((d: SipDevice) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className='font-medium'>{d.label}</div>
                      <div className='text-muted-foreground text-xs'>
                        {d.publicRef}
                        {d.deviceType ? ` · ${d.deviceType}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      {d.assignedNumber?.phoneNumber ?? (
                        <span className='text-muted-foreground'>—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.allowInbound ? (
                        <Badge variant='secondary'>{t('deskPhoneOnly')}</Badge>
                      ) : (
                        <span className='text-muted-foreground'>
                          {t('off')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.allowOutbound ? (
                        <Badge variant='outline'>{t('enabled')}</Badge>
                      ) : (
                        <span className='text-muted-foreground'>
                          {t('off')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {d.lastRegisteredAt
                        ? format(new Date(d.lastRegisteredAt), 'dd MMM, HH:mm')
                        : '—'}
                    </TableCell>
                    <TableActionCell>
                      <DeviceActions
                        device={d}
                        otherDevices={dp.devices.filter((x) => x.id !== d.id)}
                        loadNumbers={dp.listAssignableNumbers}
                        onCheckRegistration={dp.checkRegistration}
                        onRegenerate={dp.regeneratePassword}
                        onSetEnabled={dp.setEnabled}
                        onChangeNumber={dp.changeNumber}
                        onRemove={dp.remove}
                        onCredentials={showCredentials}
                      />
                    </TableActionCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateDeskPhoneDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        loadNumbers={dp.listAssignableNumbers}
        onCreate={dp.create}
        onCreated={showCredentials}
      />

      <CredentialsDialog
        open={!!credentials}
        onOpenChange={(o) => !o && setCredentials(null)}
        credentials={credentials?.credentials ?? null}
        deviceRef={credentials?.device.publicRef}
      />
    </div>
  );
}
