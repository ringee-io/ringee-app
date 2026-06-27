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
import { format } from 'date-fns';
import { useDeskPhones } from '../hooks/use-desk-phones';
import type { CreatedSipDevice, SipDevice, SipDeviceStatus } from '../types';
import { CreateDeskPhoneDialog } from './create-desk-phone-dialog';
import { CredentialsDialog } from './credentials-dialog';
import { DeviceActions } from './device-actions';

const STATUS: Record<
  SipDeviceStatus,
  { label: string; className?: string; variant?: 'secondary' | 'outline' }
> = {
  registered: { label: 'Registered', className: 'bg-emerald-600 text-white' },
  pending: { label: 'Pending', className: 'bg-orange-500 text-white' },
  offline: { label: 'Offline', variant: 'secondary' },
  disabled: { label: 'Disabled', variant: 'outline' },
  deleted: { label: 'Deleted', variant: 'outline' }
};

function StatusBadge({ status }: { status: SipDeviceStatus }) {
  const s = STATUS[status] ?? STATUS.pending;
  return (
    <Badge variant={s.variant} className={s.className}>
      {s.label}
    </Badge>
  );
}

export function DeskPhonesView() {
  const dp = useDeskPhones();
  const [createOpen, setCreateOpen] = useState(false);
  const [credentials, setCredentials] = useState<CreatedSipDevice | null>(null);

  const showCredentials = (result: CreatedSipDevice) => setCredentials(result);

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button onClick={() => setCreateOpen(true)}>Add desk phone</Button>
      </div>

      <Card>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Inbound</TableHead>
                <TableHead>Outbound</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
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
                      No desk phones yet. Connect a physical SIP phone or
                      softphone to a Ringee number.
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
                        <Badge variant='secondary'>Desk phone only</Badge>
                      ) : (
                        <span className='text-muted-foreground'>Off</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.allowOutbound ? (
                        <Badge variant='outline'>Enabled</Badge>
                      ) : (
                        <span className='text-muted-foreground'>Off</span>
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
                    <TableCell className='text-right'>
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
                    </TableCell>
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
