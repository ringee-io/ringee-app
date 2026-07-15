'use client';

import { useCallback, useState } from 'react';
import { Wallet, Clock, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useCreditStore } from '@/features/credit/store/credit.store';
import {
  THRESHOLD_PRESETS,
  RELOAD_PRESETS,
  estimateMinutes,
  money,
  paymentErrorMessage
} from '../../lib/recharge';
import { AutoReloadStatusView } from './auto-reload-status';

interface Props {
  threshold: number;
  onThresholdChange: (n: number) => void;
  reloadAmount: number;
  onReloadChange: (n: number) => void;
  currentBalance: number;
  /** Open the card-setup takeover (no saved card yet, or replacing it). */
  onNeedCard: () => void;
}

const ctaClasses = cn(
  'w-full font-semibold transition-all duration-300',
  'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-black',
  'cursor-pointer shadow-[0_0_15px_-4px_rgba(45,212,191,0.5)] hover:scale-[1.01] hover:brightness-110'
);

/**
 * Auto-reload tab. Active → the management view; inactive → a config form.
 * Auto-reload is config-only (no charge at setup) and REQUIRES a saved card
 * plus its OWN explicit consent — separate from the one-time "save card"
 * consent — to authorize off-session charges. No saved card ⇒ the CTA routes to
 * card setup first.
 */
export function AutoReloadTab({
  threshold,
  onThresholdChange,
  reloadAmount,
  onReloadChange,
  currentBalance,
  onNeedCard
}: Props) {
  const t = useTranslations('billing.credits.popover');
  const api = useApi();
  const settings = useCreditStore((s) => s.autoReloadSettings);
  const savedCard = useCreditStore((s) => s.paymentMethod);
  const minimumCreditPurchase = useCreditStore((s) => s.minimumCreditPurchase);
  const fetchAutoReloadSettings = useCreditStore(
    (s) => s.fetchAutoReloadSettings
  );

  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = settings?.autoReloadEnabled ?? false;
  const hasSaved = !!savedCard?.hasSavedMethod;
  const belowMin = reloadAmount < minimumCreditPurchase || threshold < 1;

  const enable = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/credits/auto-reload', {
        threshold,
        reloadAmount,
        consent: true
      });
      await fetchAutoReloadSettings(api);
    } catch (err) {
      console.error('Failed to enable auto-reload:', err);
      setError(paymentErrorMessage(err, t('autoReload.enableError')));
    } finally {
      setLoading(false);
    }
  }, [api, threshold, reloadAmount, fetchAutoReloadSettings, t]);

  const editSettings = useCallback(
    async (nextThreshold: number, nextReload: number) => {
      await api.patch('/credits/auto-reload-settings', {
        autoReloadThreshold: nextThreshold,
        autoReloadAmount: nextReload
      });
      await fetchAutoReloadSettings(api);
    },
    [api, fetchAutoReloadSettings]
  );

  const turnOff = useCallback(async () => {
    await api.patch('/credits/auto-reload-settings', {
      autoReloadEnabled: false
    });
    await fetchAutoReloadSettings(api);
  }, [api, fetchAutoReloadSettings]);

  if (isActive) {
    return (
      <AutoReloadStatusView
        threshold={settings?.autoReloadThreshold ?? threshold}
        reloadAmount={settings?.autoReloadAmount ?? reloadAmount}
        status={settings?.autoReloadStatus ?? 'active'}
        paymentMethod={
          savedCard?.hasSavedMethod
            ? { brand: savedCard.brand, last4: savedCard.last4 }
            : null
        }
        onEditSettings={editSettings}
        onChangeCard={onNeedCard}
        onTurnOff={turnOff}
      />
    );
  }

  return (
    <div className='mx-auto w-full max-w-md space-y-5'>
      <p className='text-muted-foreground text-sm'>{t('autoReload.intro')}</p>

      {/* Threshold */}
      <div>
        <Label className='text-muted-foreground mb-2 block text-xs font-medium tracking-wide uppercase'>
          {t('autoReload.thresholdLabel')}
        </Label>
        <div className='grid grid-cols-4 gap-2'>
          {THRESHOLD_PRESETS.map((val) => (
            <Button
              key={val}
              variant={val === threshold ? 'default' : 'outline'}
              onClick={() => onThresholdChange(val)}
              className={cn(
                'cursor-pointer tabular-nums',
                val === threshold
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
          min={1}
          value={threshold}
          onChange={(e) => onThresholdChange(Number(e.target.value) || 0)}
          className='mt-2 max-w-[160px]'
        />
      </div>

      {/* Reload amount */}
      <div>
        <Label className='text-muted-foreground mb-2 block text-xs font-medium tracking-wide uppercase'>
          {t('autoReload.amountLabel')}
        </Label>
        <div className='grid grid-cols-4 gap-2'>
          {RELOAD_PRESETS.map((val) => (
            <Button
              key={val}
              variant={val === reloadAmount ? 'default' : 'outline'}
              onClick={() => onReloadChange(val)}
              className={cn(
                'cursor-pointer tabular-nums',
                val === reloadAmount
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
          placeholder={t('autoReload.customPlaceholder')}
          value={reloadAmount}
          onChange={(e) => onReloadChange(Number(e.target.value) || 0)}
          aria-invalid={belowMin}
          className={cn('mt-2 max-w-[160px]', belowMin && 'border-red-500')}
        />
        {reloadAmount < minimumCreditPurchase && (
          <p className='mt-1 text-xs text-red-500'>
            {t('common.minAmountError', { amount: minimumCreditPurchase })}
          </p>
        )}
      </div>

      {/* Rule + estimate */}
      <div className='border-border/50 bg-muted/20 space-y-1.5 rounded-xl border p-4 text-sm'>
        <p className='text-muted-foreground text-xs'>
          {t.rich('autoReload.rule', {
            threshold: money(threshold),
            amount: money(reloadAmount),
            b: (chunks) => <strong className='text-foreground'>{chunks}</strong>
          })}
        </p>
        <div className='flex items-center justify-between pt-1'>
          <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
            <Wallet className='h-3.5 w-3.5' />
            {t('amount.currentBalance')}
          </span>
          <span className='tabular-nums'>{money(currentBalance)}</span>
        </div>
        <div className='flex items-center justify-between'>
          <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
            <Clock className='h-3.5 w-3.5' />
            {t('autoReload.estAfterReload')}
          </span>
          <span className='tabular-nums'>
            {t('checkout.minutesValue', {
              minutes: estimateMinutes(reloadAmount).toLocaleString()
            })}
          </span>
        </div>
      </div>

      {hasSaved ? (
        <>
          {/* SEPARATE explicit consent — required, not the save-card consent. */}
          <label
            htmlFor='auto-reload-consent'
            className='border-border/60 bg-muted/20 flex cursor-pointer items-start gap-2.5 rounded-xl border p-3'
          >
            <Checkbox
              id='auto-reload-consent'
              checked={consent}
              onCheckedChange={(c) => setConsent(c === true)}
              className='mt-0.5'
            />
            <span className='text-xs leading-snug'>
              {t('autoReload.consent')}
            </span>
          </label>

          {error && (
            <p className='flex items-center gap-1.5 text-xs text-red-500'>
              <AlertTriangle className='h-3.5 w-3.5' />
              {error}
            </p>
          )}

          <Button
            onClick={enable}
            disabled={loading || belowMin || !consent}
            size='lg'
            className={ctaClasses}
          >
            {loading ? t('common.redirecting') : t('autoReload.enable')}
          </Button>
        </>
      ) : (
        <div className='space-y-3'>
          <div className='border-border/60 bg-muted/20 text-muted-foreground flex items-start gap-2 rounded-xl border p-3 text-xs'>
            <CreditCardHint />
            {t('autoReload.requiresMethod')}
          </div>
          <Button onClick={onNeedCard} size='lg' className={ctaClasses}>
            {t('autoReload.addMethod')}
          </Button>
        </div>
      )}
    </div>
  );
}

function CreditCardHint() {
  return (
    <span className='mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center'>
      <AlertTriangle className='h-3.5 w-3.5 text-amber-400' />
    </span>
  );
}
