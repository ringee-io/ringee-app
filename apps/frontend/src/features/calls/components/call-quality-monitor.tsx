'use client';

import { useEffect, useState } from 'react';
import type { Call } from '@telnyx/webrtc';
import {
  monitorCallQuality,
  type CallQualitySnapshot
} from '@ringee/dialer-core/engine';
import { CallQualityIndicator } from '@ringee/dialer-ui';
import { useFormatter, useTranslations } from 'next-intl';

interface Props {
  call: Call | null;
  connected: boolean;
}

const QUALITY_TONE = {
  good: 'positive',
  fair: 'warning',
  poor: 'danger',
  unknown: 'neutral'
} as const;

/** Keeps WebRTC samples local to the readout, without updating shared call state. */
export function CallQualityMonitor({ call, connected }: Props) {
  const t = useTranslations('calls.callQuality');
  const format = useFormatter();
  const [sample, setSample] = useState<{
    call: Call;
    snapshot: CallQualitySnapshot;
  } | null>(null);

  useEffect(() => {
    if (!call || !connected) {
      setSample(null);
      return;
    }
    let listening = true;
    const unsubscribe = monitorCallQuality(call, (snapshot) => {
      if (listening) setSample({ call, snapshot });
    });
    return () => {
      listening = false;
      unsubscribe();
    };
  }, [call, connected]);

  if (!call || !connected) return null;
  // Call objects are mutable. An identity check also hides the previous call's
  // sample on the render before the new call's subscription has started.
  const snapshot = sample?.call === call ? sample.snapshot : null;
  const rating = snapshot?.rating ?? 'unknown';
  const metric = (value: number | null | undefined, unit: 'ms' | 'percent') =>
    value == null
      ? t('unavailable')
      : t(unit, {
          value: format.number(value, { maximumFractionDigits: 1 })
        });

  return (
    <CallQualityIndicator
      tone={QUALITY_TONE[rating]}
      statusText={t('status', { quality: t(rating) })}
      title={t('title')}
      description={t('description')}
      metrics={[
        { label: t('latency'), value: metric(snapshot?.rttMs, 'ms') },
        { label: t('jitter'), value: metric(snapshot?.jitterMs, 'ms') },
        {
          label: t('packetLoss'),
          value: metric(snapshot?.packetLossPercent, 'percent')
        },
        {
          label: t('outboundLatency'),
          value: metric(snapshot?.outboundRttMs, 'ms')
        },
        {
          label: t('outboundJitter'),
          value: metric(snapshot?.outboundJitterMs, 'ms')
        },
        {
          label: t('outboundPacketLoss'),
          value: metric(snapshot?.outboundPacketLossPercent, 'percent')
        }
      ]}
      warning={rating === 'poor' ? t('poorConnectionHint') : undefined}
    />
  );
}
