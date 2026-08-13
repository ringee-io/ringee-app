'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import type { SipDeviceCredentials } from '../types';
import { useTranslations } from 'next-intl';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentials: SipDeviceCredentials | null;
  deviceRef?: string;
}

function Row({ label, value }: { label: string; value: string }) {
  const t = useTranslations('calls.deskPhones.credentials');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('copied', { label }));
    } catch {
      toast.error(t('copyFailed'));
    }
  };
  return (
    <div className='flex items-center justify-between gap-3 py-1.5'>
      <span className='text-muted-foreground text-sm'>{label}</span>
      <button
        type='button'
        onClick={copy}
        title={t('copy')}
        className='hover:bg-muted max-w-[60%] truncate rounded px-1.5 py-0.5 font-mono text-sm'
      >
        {value}
      </button>
    </div>
  );
}

/**
 * One-time credentials screen (wizard screen 5 / regenerate result). The
 * password is only available here — once this closes it can never be shown
 * again, only regenerated.
 */
export function CredentialsDialog({
  open,
  onOpenChange,
  credentials,
  deviceRef
}: Props) {
  const t = useTranslations('calls.deskPhones.credentials');
  const [revealed, setRevealed] = useState(false);

  if (!credentials) return null;

  const copyAll = async () => {
    const lines = [
      'Account: Enabled',
      'Label: Ringee',
      'Display Name: Ringee',
      `Register Name: ${credentials.username}`,
      `User Name: ${credentials.username}`,
      `Authenticate ID: ${credentials.authId}`,
      `Password: ${credentials.password}`,
      `SIP Server: ${credentials.sipServer}`,
      `Outbound Proxy: ${credentials.outboundProxy}`,
      `Port: ${credentials.port}`,
      `Transport: ${credentials.transport}`,
      credentials.callerId ? `Caller ID: ${credentials.callerId}` : '',
      credentials.inboundNumber
        ? `Inbound Number: ${credentials.inboundNumber}`
        : ''
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      toast.success(t('allCopied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* One-time secret: never dismiss on outside click or Esc — only the X
          or "Done" button closes it, so the password can't be lost by accident. */}
      <DialogContent
        className='sm:max-w-md'
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {deviceRef ? `${deviceRef} — ` : ''}
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        <div className='flex items-center gap-2'>
          <Badge className='bg-orange-500 text-white'>
            {t('pendingRegistration')}
          </Badge>
          <span className='text-muted-foreground text-xs'>
            {t('statusHint')}
          </span>
        </div>

        <Separator />

        <div className='divide-y'>
          <Row label={t('fields.sipServer')} value={credentials.sipServer} />
          <Row
            label={t('fields.outboundProxy')}
            value={credentials.outboundProxy}
          />
          <Row label={t('fields.port')} value={String(credentials.port)} />
          <Row label={t('fields.transport')} value={credentials.transport} />
          <Row label={t('fields.username')} value={credentials.username} />
          <Row label={t('fields.authId')} value={credentials.authId} />
          <div className='flex items-center justify-between gap-3 py-1.5'>
            <span className='text-muted-foreground text-sm'>
              {t('fields.password')}
            </span>
            <div className='flex items-center gap-2'>
              <span className='font-mono text-sm'>
                {revealed ? credentials.password : '••••••••••••'}
              </span>
              <Button
                type='button'
                size='sm'
                variant='ghost'
                onClick={() => setRevealed((v) => !v)}
              >
                {revealed ? t('hide') : t('reveal')}
              </Button>
            </div>
          </div>
          {credentials.callerId && (
            <Row label={t('fields.callerId')} value={credentials.callerId} />
          )}
          {credentials.inboundNumber && (
            <Row
              label={t('fields.inboundNumber')}
              value={credentials.inboundNumber}
            />
          )}
          <div className='flex items-center justify-between gap-3 py-1.5'>
            <span className='text-muted-foreground text-sm'>
              {t('fields.inboundMode')}
            </span>
            <Badge variant='secondary'>{t('deskPhoneOnly')}</Badge>
          </div>
          <div className='flex items-center justify-between gap-3 py-1.5'>
            <span className='text-muted-foreground text-sm'>
              {t('fields.outbound')}
            </span>
            <Badge
              variant={credentials.outboundEnabled ? 'default' : 'outline'}
            >
              {credentials.outboundEnabled ? t('enabled') : t('disabled')}
            </Badge>
          </div>
        </div>

        <DialogFooter className='gap-2 sm:justify-between'>
          <Button type='button' variant='outline' onClick={copyAll}>
            {t('copyAll')}
          </Button>
          <Button type='button' onClick={() => onOpenChange(false)}>
            {t('done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
