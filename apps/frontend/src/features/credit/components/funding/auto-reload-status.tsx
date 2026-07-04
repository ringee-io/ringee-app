'use client';

import { useState } from 'react';
import {
  RefreshCw,
  CreditCard,
  Loader2,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { cn } from '@ringee/frontend-shared/lib/utils';
import type { AutoReloadStatus as Status } from '@/features/credit/store/credit.store';
import {
  MIN_AMOUNT,
  THRESHOLD_PRESETS,
  RELOAD_PRESETS,
  formatBrand,
  money
} from '../../lib/recharge';

interface Props {
  threshold: number;
  reloadAmount: number;
  status: Status;
  paymentMethod: { brand: string | null; last4: string | null } | null;
  onEditSettings: (threshold: number, reloadAmount: number) => Promise<void>;
  onChangeCard: () => void;
  onTurnOff: () => Promise<void>;
}

/**
 * "Auto-reload active" view: the rule (when below $X add $Y), the card on file,
 * a status badge (Active / Reloading / Payment failed / Requires new method),
 * and Edit settings · Change payment method · Turn off. When the card needs
 * attention, "Change payment method" is surfaced as the primary action.
 */
export function AutoReloadStatusView({
  threshold,
  reloadAmount,
  status,
  paymentMethod,
  onEditSettings,
  onChangeCard,
  onTurnOff
}: Props) {
  const t = useTranslations('billing.credits.popover');
  const [editing, setEditing] = useState(false);
  const [draftThreshold, setDraftThreshold] = useState(threshold);
  const [draftReload, setDraftReload] = useState(reloadAmount);
  const [saving, setSaving] = useState(false);
  const [turningOff, setTurningOff] = useState(false);

  const needsAttention =
    status === 'failed' || status === 'requires_payment_method';
  const belowMin = draftReload < MIN_AMOUNT || draftThreshold < 1;

  const badge = {
    active: {
      label: t('autoReload.statusActive'),
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
      Icon: CheckCircle2
    },
    charging: {
      label: t('autoReload.statusReloading'),
      className: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
      Icon: Loader2
    },
    failed: {
      label: t('autoReload.statusFailed'),
      className: 'border-red-500/30 bg-red-500/10 text-red-400',
      Icon: AlertTriangle
    },
    requires_payment_method: {
      label: t('autoReload.statusRequiresMethod'),
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
      Icon: AlertTriangle
    },
    disabled: {
      label: t('autoReload.statusActive'),
      className: 'border-border/60 bg-muted/40 text-muted-foreground',
      Icon: CheckCircle2
    }
  }[status];

  const save = async () => {
    if (belowMin) return;
    setSaving(true);
    try {
      await onEditSettings(draftThreshold, draftReload);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const turnOff = async () => {
    setTurningOff(true);
    try {
      await onTurnOff();
    } finally {
      setTurningOff(false);
    }
  };

  return (
    <div className='mx-auto w-full max-w-md space-y-4'>
      <div
        className={cn(
          'rounded-2xl border p-5',
          needsAttention
            ? 'border-amber-500/25 bg-amber-500/[0.06]'
            : 'border-emerald-500/25 bg-emerald-500/[0.06]'
        )}
      >
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full',
                needsAttention ? 'bg-amber-500/15' : 'bg-emerald-500/15'
              )}
            >
              <RefreshCw
                className={cn(
                  'h-4 w-4',
                  needsAttention ? 'text-amber-400' : 'text-emerald-400'
                )}
              />
            </span>
            <p className='text-sm font-semibold'>
              {t('autoReload.activeTitle')}
            </p>
          </div>
          <span
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
              badge.className
            )}
          >
            <badge.Icon
              className={cn('h-3 w-3', status === 'charging' && 'animate-spin')}
            />
            {badge.label}
          </span>
        </div>

        <p className='text-muted-foreground border-border/40 mt-4 border-t pt-4 text-sm'>
          {t.rich('autoReload.rule', {
            threshold: money(threshold),
            amount: money(reloadAmount),
            b: (chunks) => <strong className='text-foreground'>{chunks}</strong>
          })}
        </p>

        {paymentMethod?.last4 && (
          <div className='text-muted-foreground mt-2 flex items-center gap-1.5 text-sm'>
            <CreditCard className='h-3.5 w-3.5' />
            {formatBrand(paymentMethod.brand)} •••• {paymentMethod.last4}
          </div>
        )}
      </div>

      {needsAttention && (
        <Button
          onClick={onChangeCard}
          className={cn(
            'w-full cursor-pointer font-semibold',
            'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-black hover:brightness-110'
          )}
        >
          {t('autoReload.changeMethod')}
        </Button>
      )}

      {editing ? (
        <div className='border-border/60 bg-muted/20 space-y-4 rounded-xl border p-4'>
          <div>
            <p className='mb-2 text-xs font-medium'>
              {t('autoReload.thresholdLabel')}
            </p>
            <div className='flex flex-wrap gap-2'>
              {THRESHOLD_PRESETS.map((val) => (
                <Button
                  key={val}
                  variant={val === draftThreshold ? 'default' : 'outline'}
                  onClick={() => setDraftThreshold(val)}
                  className={cn(
                    'min-w-[56px] flex-1 cursor-pointer',
                    val === draftThreshold
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
                      : 'hover:border-emerald-500 hover:text-emerald-400'
                  )}
                >
                  ${val}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className='mb-2 text-xs font-medium'>
              {t('autoReload.amountLabel')}
            </p>
            <div className='flex flex-wrap gap-2'>
              {RELOAD_PRESETS.map((val) => (
                <Button
                  key={val}
                  variant={val === draftReload ? 'default' : 'outline'}
                  onClick={() => setDraftReload(val)}
                  className={cn(
                    'min-w-[56px] flex-1 cursor-pointer',
                    val === draftReload
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
                      : 'hover:border-emerald-500 hover:text-emerald-400'
                  )}
                >
                  ${val}
                </Button>
              ))}
            </div>
            <Input
              type='number'
              min={MIN_AMOUNT}
              value={draftReload}
              onChange={(e) => setDraftReload(Number(e.target.value) || 0)}
              className='mt-2 max-w-[160px]'
            />
          </div>
          <div className='flex gap-2'>
            <Button
              onClick={save}
              disabled={saving || belowMin}
              className='cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
            >
              {saving ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                t('monthly.save')
              )}
            </Button>
            <Button
              variant='ghost'
              onClick={() => setEditing(false)}
              disabled={saving}
              className='cursor-pointer'
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className='grid grid-cols-2 gap-2'>
          <Button
            variant='outline'
            onClick={() => {
              setDraftThreshold(threshold);
              setDraftReload(reloadAmount);
              setEditing(true);
            }}
            className='cursor-pointer'
          >
            {t('autoReload.editSettings')}
          </Button>
          <Button
            variant='outline'
            onClick={onChangeCard}
            className='cursor-pointer'
          >
            {t('autoReload.changeMethod')}
          </Button>
        </div>
      )}

      <Button
        variant='ghost'
        onClick={turnOff}
        disabled={turningOff}
        className='text-muted-foreground w-full cursor-pointer text-sm hover:text-red-400'
      >
        {turningOff ? (
          <Loader2 className='h-4 w-4 animate-spin' />
        ) : (
          t('autoReload.turnOff')
        )}
      </Button>
    </div>
  );
}
