'use client';

import { useState } from 'react';
import {
  CalendarSync,
  CreditCard,
  Loader2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { formatBrand } from '../../lib/recharge';
import {
  MONTHLY_PRESETS,
  money,
  paymentErrorMessage
} from '../../lib/recharge';
import { useCreditStore } from '@/features/credit/store/credit.store';

interface Props {
  amount: number | null;
  nextChargeDate: string | null;
  paymentMethod: { brand: string | null; last4: string | null } | null;
  onEditAmount: (amount: number) => Promise<void>;
  onChangeCard: () => void;
  onCancel: () => Promise<void>;
}

/**
 * "Monthly funding active" view: amount, next charge date and card on file,
 * with inline amount editing, change-card, and a guarded cancel. All mutations
 * go through the parent's api-bound callbacks; this stays presentational.
 */
export function MonthlyStatus({
  amount,
  nextChargeDate,
  paymentMethod,
  onEditAmount,
  onChangeCard,
  onCancel
}: Props) {
  const t = useTranslations('billing.credits.popover');
  const minimumCreditPurchase = useCreditStore((s) => s.minimumCreditPurchase);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(amount ?? 50);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const belowMin = draft < minimumCreditPurchase;

  const nextCharge = nextChargeDate
    ? new Date(nextChargeDate).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : null;

  const save = async () => {
    if (belowMin) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onEditAmount(draft);
      setEditing(false);
    } catch (err) {
      setSaveError(paymentErrorMessage(err, t('checkout.errorBody')));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      await onCancel();
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  };

  return (
    <div className='mx-auto w-full max-w-md space-y-4'>
      <div className='rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5'>
        <div className='flex items-center gap-2'>
          <span className='flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15'>
            <CheckCircle2 className='h-4 w-4 text-emerald-400' />
          </span>
          <div>
            <p className='text-sm font-semibold'>{t('monthly.activeTitle')}</p>
            <p className='text-muted-foreground text-xs'>
              {t('monthly.activeSubtitle')}
            </p>
          </div>
        </div>

        <dl className='border-border/40 mt-4 space-y-2.5 border-t pt-4 text-sm'>
          <div className='flex items-center justify-between'>
            <dt className='text-muted-foreground'>{t('monthly.amountRow')}</dt>
            <dd className='font-semibold tabular-nums'>
              {money(amount ?? 0)}
              <span className='text-muted-foreground font-normal'>
                {t('monthly.perMonthSuffix')}
              </span>
            </dd>
          </div>
          {nextCharge && (
            <div className='flex items-center justify-between'>
              <dt className='text-muted-foreground flex items-center gap-1.5'>
                <CalendarSync className='h-3.5 w-3.5' />
                {t('monthly.nextCharge')}
              </dt>
              <dd className='font-medium tabular-nums'>{nextCharge}</dd>
            </div>
          )}
          {paymentMethod?.last4 && (
            <div className='flex items-center justify-between'>
              <dt className='text-muted-foreground flex items-center gap-1.5'>
                <CreditCard className='h-3.5 w-3.5' />
                {t('monthly.paymentMethodRow')}
              </dt>
              <dd className='font-medium'>
                {formatBrand(paymentMethod.brand)} •••• {paymentMethod.last4}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Inline amount editor */}
      {editing ? (
        <div className='border-border/60 bg-muted/20 space-y-3 rounded-xl border p-4'>
          <p className='text-sm font-medium'>{t('monthly.editAmount')}</p>
          <div className='flex flex-wrap gap-2'>
            {MONTHLY_PRESETS.map((val) => (
              <Button
                key={val}
                variant={val === draft ? 'default' : 'outline'}
                onClick={() => setDraft(val)}
                className={cn(
                  'min-w-[64px] flex-1 cursor-pointer',
                  val === draft
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
            min={minimumCreditPurchase}
            value={draft}
            onChange={(e) => setDraft(Number(e.target.value) || 0)}
            aria-invalid={belowMin}
            className={cn('max-w-[160px]', belowMin && 'border-red-500')}
          />
          {belowMin && (
            <p className='text-xs text-red-500'>
              {t('common.minAmountError', { amount: minimumCreditPurchase })}
            </p>
          )}
          {saveError && (
            <p className='flex items-center gap-1.5 text-xs text-red-500'>
              <AlertTriangle className='h-3.5 w-3.5' />
              {saveError}
            </p>
          )}
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
              setDraft(amount ?? 50);
              setEditing(true);
            }}
            className='cursor-pointer'
          >
            {t('monthly.editAmount')}
          </Button>
          <Button
            variant='outline'
            onClick={onChangeCard}
            className='cursor-pointer'
          >
            {t('monthly.changeMethod')}
          </Button>
        </div>
      )}

      {/* Cancel */}
      {confirmCancel ? (
        <div className='space-y-2 rounded-xl border border-red-500/30 bg-red-500/5 p-4'>
          <p className='text-sm'>{t('monthly.cancelConfirm')}</p>
          <div className='flex gap-2'>
            <Button
              onClick={cancel}
              disabled={cancelling}
              variant='outline'
              className='flex-1 cursor-pointer border-red-500/40 text-red-400 hover:bg-red-500/10'
            >
              {cancelling ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                t('monthly.cancelConfirmYes')
              )}
            </Button>
            <Button
              variant='ghost'
              onClick={() => setConfirmCancel(false)}
              disabled={cancelling}
              className='flex-1 cursor-pointer'
            >
              {t('monthly.keep')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant='ghost'
          onClick={() => setConfirmCancel(true)}
          className='text-muted-foreground w-full cursor-pointer text-sm hover:text-red-400'
        >
          {t('monthly.cancel')}
        </Button>
      )}
    </div>
  );
}
