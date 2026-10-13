'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, RotateCw, X } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  SheetDescription,
  SheetTitle
} from '@ringee/frontend-shared/components/ui/sheet';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { usePanelData } from '../hooks/use-automation-data';
import type { AutomationCard } from '../types';
import { ActivityList } from './activity-list';
import { CapabilityCard } from './capability-card';

/**
 * The open rail: three capabilities ready to switch on, and what they did
 * lately. Loads its details when it opens — nothing here runs on every page.
 */
export function AutomationPanel({
  titleId,
  onClose,
  inSheet = false
}: {
  titleId: string;
  onClose: () => void;
  /** Rendered inside the overlay sheet, whose title must be the dialog's. */
  inSheet?: boolean;
}) {
  const t = useTranslations('aiVoiceAgents.automations');
  const { panel, status, reload, setPanel } = usePanelData(true);
  const [announcement, setAnnouncement] = useState('');

  const changed = (card?: AutomationCard) => {
    if (card && panel) {
      // Show the card the server just returned at once, then refresh the rest.
      setPanel({
        ...panel,
        cards: panel.cards.map((current) =>
          current.capability === card.capability ? card : current
        )
      });
      setAnnouncement(
        t('announce', {
          title: t(`capabilities.${card.capability}.title`),
          state: t(`state.${card.state}`)
        })
      );
    }
    void reload(true);
  };

  const Title = inSheet ? SheetTitle : 'h2';
  const Description = inSheet ? SheetDescription : 'p';
  const remindersNumber =
    panel?.cards.find((card) => card.capability === 'reminders')?.reminders
      ?.callerNumber ?? null;

  return (
    <div className='flex h-full flex-col'>
      <header className='flex items-start gap-2 border-b px-4 py-3'>
        <div className='min-w-0 flex-1'>
          {/* In the sheet, Radix names the dialog by its own title id. */}
          <Title
            {...(inSheet ? {} : { id: titleId })}
            className='text-sm font-semibold'
          >
            {t('title')}
          </Title>
          <Description className='text-muted-foreground text-xs'>
            {panel
              ? t('subtitle', { count: panel.operational })
              : t('subtitleLoading')}
          </Description>
        </div>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-11 shrink-0 md:size-8'
          onClick={onClose}
          aria-label={t('close')}
        >
          <X className='size-4' />
        </Button>
      </header>

      <div className='min-h-0 flex-1 space-y-3 overflow-y-auto p-3'>
        {status === 'loading' ? (
          <>
            <Skeleton className='h-24 w-full rounded-xl' />
            <Skeleton className='h-24 w-full rounded-xl' />
            <Skeleton className='h-24 w-full rounded-xl' />
          </>
        ) : status === 'error' || !panel ? (
          <div className='space-y-3 rounded-xl border p-4 text-sm'>
            <p className='flex items-center gap-2'>
              <AlertTriangle className='size-4 text-amber-600' aria-hidden />
              {t('loadError')}
            </p>
            <Button
              size='sm'
              variant='outline'
              className='h-11 rounded-lg md:h-8'
              onClick={() => void reload()}
            >
              <RotateCw className='size-3.5' />
              {t('retry')}
            </Button>
          </div>
        ) : !panel.enabled ? (
          <p className='text-muted-foreground text-sm'>{t('unavailable')}</p>
        ) : (
          <>
            {panel.cards.map((card) => (
              <CapabilityCard
                key={card.capability}
                card={card}
                remindersNumber={remindersNumber}
                canConfigure={panel.canConfigure}
                onChanged={changed}
              />
            ))}
            <ActivityList items={panel.activity} onChanged={() => changed()} />
          </>
        )}
      </div>

      <p aria-live='polite' className='sr-only'>
        {announcement}
      </p>
    </div>
  );
}
