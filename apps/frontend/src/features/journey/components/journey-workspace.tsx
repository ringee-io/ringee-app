'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useJourneyCopy } from '../lib/copy';
import { formatCents } from '../lib/presentation';
import { JourneySummary } from './journey-summary';
import { StageCard } from './stage-card';
import { CapabilitiesPanel } from './capabilities-panel';
import { StageCelebration } from './celebration';
import type {
  JourneyClaimAllResult,
  JourneyClaimResult,
  JourneyOverview
} from '../types';

/**
 * Ringee Journey.
 *
 * This component renders the server's model and does nothing else — there is no
 * threshold, no stage classification and no reward rule in this file. When a
 * claim resolves, the whole overview is refetched rather than patched locally,
 * so what the user sees is always what the backend actually recorded.
 *
 * Route access is enforced by the backend (`@OrgAdminOnly()` on every journey
 * route); the page's own admin check and the hidden nav entry are UX, not
 * security.
 */
export function JourneyWorkspace({ initial }: { initial: JourneyOverview }) {
  const { t } = useJourneyCopy();
  const locale = useLocale();
  const api = useApi();

  const [data, setData] = useState(initial);
  const [claimingStage, setClaimingStage] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);
  const [celebrating, setCelebrating] = useState<string | null>(null);
  // Announced politely so a screen reader hears the claim result without the
  // focus being yanked away from the button that caused it.
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => setData(initial), [initial]);

  /** The earliest stage still owed a celebration. One at a time. */
  const pendingCelebration = useMemo(
    () => data.stages.find((stage) => stage.celebrationPending) ?? null,
    [data.stages]
  );

  useEffect(() => {
    if (pendingCelebration && !celebrating) {
      setCelebrating(pendingCelebration.id);
    }
  }, [pendingCelebration, celebrating]);

  const refresh = useCallback(async () => {
    try {
      const fresh = await api.get<JourneyOverview>('/journey/overview');
      setData(fresh);
    } catch {
      // A failed refresh leaves the last good model on screen; the claim result
      // has already been reported and the next load will reconcile.
    }
  }, [api]);

  /** Turns a backend message code into copy. Never invents a reason. */
  const describe = useCallback(
    (result: JourneyClaimResult) => {
      const key = result.messageCode.replace(/^journey\./, '');
      const amount = formatCents(result.amountCents, locale);
      // The message code is a runtime value from the API, so the key cannot be
      // statically typed. `t.has` keeps an unknown code from rendering a raw
      // message path; `amount` is ignored by the messages that do not use it.
      return t.has(`claim.${key}` as never)
        ? t(`claim.${key}` as never, { amount } as never)
        : t('claim.failed');
    },
    [t, locale]
  );

  const report = useCallback(
    (result: JourneyClaimResult) => {
      const message = describe(result);
      setAnnouncement(message);
      if (result.outcome === 'claimed') toast.success(message);
      else if (result.outcome === 'rate_limited') toast.error(message);
      else toast.info(message);
    },
    [describe]
  );

  const claim = useCallback(
    async (stageId: string) => {
      setClaimingStage(stageId);
      try {
        const result = await api.post<JourneyClaimResult>(
          '/journey/rewards/claim',
          { stageId }
        );
        report(result);
        await refresh();
      } catch {
        const message = t('claim.failed');
        setAnnouncement(message);
        toast.error(message);
      } finally {
        setClaimingStage(null);
      }
    },
    [api, report, refresh, t]
  );

  /**
   * One request, not a loop. The backend walks the ladder in order with its own
   * idempotency key per stage, so a partial failure cannot double-pay or leave
   * a hole.
   */
  const claimAll = useCallback(async () => {
    setClaimingAll(true);
    try {
      const result = await api.post<JourneyClaimAllResult>(
        '/journey/rewards/claim-all',
        {}
      );
      if (result.claimedCents > 0) {
        const message = t('claim.claimed', {
          amount: formatCents(result.claimedCents, locale)
        });
        setAnnouncement(message);
        toast.success(message);
      } else {
        const last = result.results.at(-1);
        if (last) report(last);
      }
      await refresh();
    } catch {
      const message = t('claim.failed');
      setAnnouncement(message);
      toast.error(message);
    } finally {
      setClaimingAll(false);
    }
  }, [api, refresh, report, t, locale]);

  const dismissCelebration = useCallback(async () => {
    const stageId = celebrating;
    setCelebrating(null);
    if (!stageId) return;
    // Persisted server-side so the animation does not replay on another device.
    await api.post('/journey/celebrate', { stageId }).catch(() => undefined);
    setData((current) => ({
      ...current,
      stages: current.stages.map((stage) =>
        stage.id === stageId ? { ...stage, celebrationPending: false } : stage
      )
    }));
  }, [api, celebrating]);

  const trackNextAction = useCallback(() => {
    api
      .post('/journey/events', { name: 'journey_next_action_clicked' })
      .catch(() => undefined);
  }, [api]);

  useEffect(() => {
    api
      .post('/journey/events', { name: 'journey_started' })
      .catch(() => undefined);
    // Once per mount: this is "the user opened the Journey", not "the model changed".
  }, [api]);

  if (!data.program.active) {
    return <ProgramPaused />;
  }

  return (
    <div className='flex flex-col gap-6 pb-8'>
      <header>
        <h1 className='text-xl font-semibold'>{t('title')}</h1>
        <p className='text-muted-foreground mt-1 text-sm'>{t('subtitle')}</p>
      </header>

      <p aria-live='polite' role='status' className='sr-only'>
        {announcement}
      </p>

      <JourneySummary
        data={data}
        onClaimAll={claimAll}
        claimingAll={claimingAll}
        onNextActionClick={trackNextAction}
      />

      <section>
        <ul aria-label={t('a11y.stageList')} className='flex flex-col gap-3'>
          {data.stages.map((stage) => (
            <StageCard
              key={stage.id}
              stage={stage}
              isCurrent={stage.id === data.currentStageId}
              rewardsAvailable={data.program.rewardsAvailable}
              rewardsBlockedReason={data.program.rewardsBlockedReason}
              onClaim={claim}
              claiming={claimingStage === stage.id}
            />
          ))}
        </ul>
      </section>

      <CapabilitiesPanel
        capabilities={data.capabilities}
        workspaceType={data.workspaceType}
        window={data.window}
      />

      {celebrating && (
        <StageCelebration
          stageId={celebrating}
          onDismiss={dismissCelebration}
        />
      )}
    </div>
  );
}

function ProgramPaused() {
  const { t } = useJourneyCopy();
  return (
    <div className='bg-card/60 flex flex-col items-center gap-2 rounded-2xl border p-10 text-center'>
      <p className='text-sm font-semibold'>{t('paused.title')}</p>
      <p className='text-muted-foreground max-w-md text-xs leading-relaxed'>
        {t('paused.body')}
      </p>
    </div>
  );
}
