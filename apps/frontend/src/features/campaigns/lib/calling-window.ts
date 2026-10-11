'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { Campaign } from '../types/campaign.types';

/** Indexes match `Date.getDay()`; labels come from `common.weekdaysShort`. */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

type CallingWindowFields = Pick<
  Campaign,
  'workDays' | 'workStartMin' | 'workEndMin' | 'timezone'
>;

/**
 * A campaign's calling window as it is configured (CMP-004): "Mon–Fri
 * 09:00–17:00" — a run of three or more days as a range — and its time zone.
 * It describes the setting only; whether the window is open now is the
 * server's to decide.
 */
export function useCallingWindowText() {
  const t = useTranslations('campaigns.detail.config');
  const tCommon = useTranslations('common');

  return useCallback(
    (campaign: CallingWindowFields) => {
      const workDays = [...(campaign.workDays ?? [])].sort((a, b) => a - b);
      const contiguous =
        workDays.length >= 3 &&
        workDays.every((d, i) => i === 0 || d === workDays[i - 1] + 1);
      const dayLabel = (d: number) => tCommon(`weekdaysShort.${DAY_KEYS[d]}`);
      const days =
        workDays.length === 7
          ? t('everyDay')
          : contiguous
            ? `${dayLabel(workDays[0])}–${dayLabel(workDays[workDays.length - 1])}`
            : workDays.map(dayLabel).join(', ');

      return {
        schedule: days
          ? `${days} ${minutesToTime(campaign.workStartMin)}–${minutesToTime(
              campaign.workEndMin
            )}`
          : null,
        timezone: campaign.timezone.replace(/_/g, ' ')
      };
    },
    [t, tCommon]
  );
}
