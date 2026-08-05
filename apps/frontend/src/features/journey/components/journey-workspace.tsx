'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { toast } from 'sonner';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useJourneyCopy } from '../lib/copy';
import { formatCents } from '../lib/presentation';
import { buildThreads, findThread } from '../lib/threads';
import { JourneySummary } from './journey-summary';
import { JourneyGraph } from './journey-graph';
import { NodeDrawer } from './node-drawer';
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
 * threshold, no node classification, no dependency rule, no completion rule and
 * no reward rule in this file. When a claim resolves, the whole overview is
 * refetched rather than patched locally, so what the user sees is always what
 * the backend actually recorded.
 *
 * Route access is enforced by the backend (`@OrgAdminOnly()` on every journey
 * route); the page's own admin check and the hidden nav entry are UX, not
 * security.
 */
export function JourneyWorkspace({ initial }: { initial: JourneyOverview }) {
  const { t } = useJourneyCopy();
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [data, setData] = useState(initial);
  const [claimingNode, setClaimingNode] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);
  const [celebrating, setCelebrating] = useState<string | null>(null);
  // Announced politely so a screen reader hears the claim result without the
  // focus being yanked away from the button that caused it.
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => setData(initial), [initial]);

  /**
   * The map's seven nodes: one per track. The program's steps live inside them
   * — see `lib/threads.ts` for why, and for the rule that nothing there is
   * decided client-side.
   */
  const threads = useMemo(() => buildThreads(data), [data]);

  /**
   * Drawer selection lives in the URL, so it survives a refresh, can be shared,
   * and closes on Back. A step id still resolves — to the thread that contains
   * it — so links minted before the map became thread-level keep working, and
   * an id that is in neither is ignored rather than rendering an empty drawer.
   */
  const selectedId = searchParams.get('node');
  const selectedThread = useMemo(
    () => findThread(threads, selectedId),
    [threads, selectedId]
  );

  const setSelectedNode = useCallback(
    (nodeId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nodeId) params.set('node', nodeId);
      else params.delete('node');
      const query = params.toString();
      // `scroll: false` keeps the graph where the user left it.
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false
      });
    },
    [router, pathname, searchParams]
  );

  /**
   * Opening a thread is the map's engagement signal. Fired once per open.
   *
   * The event carries a *program* node id, because the backend validates it
   * against the program before recording — a track id would simply be dropped.
   * The step reported is the one the person actually came to look at: the first
   * one in the thread that is not finished yet.
   */
  const lastViewed = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedThread) return;
    const step =
      selectedThread.steps.find((s) => s.status !== 'achieved') ??
      selectedThread.steps[0];
    if (!step || lastViewed.current === step.id) return;
    lastViewed.current = step.id;
    api
      .post('/journey/events', {
        name: 'journey_node_viewed',
        nodeId: step.id
      })
      .catch(() => undefined);
  }, [api, selectedThread]);

  /** The earliest node still owed a celebration. One at a time. */
  const pendingCelebration = useMemo(
    () => data.nodes.find((node) => node.celebrationPending) ?? null,
    [data.nodes]
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
    async (nodeId: string) => {
      setClaimingNode(nodeId);
      try {
        const result = await api.post<JourneyClaimResult>(
          '/journey/rewards/claim',
          { nodeId }
        );
        report(result);
        await refresh();
      } catch {
        const message = t('claim.failed');
        setAnnouncement(message);
        toast.error(message);
      } finally {
        setClaimingNode(null);
      }
    },
    [api, report, refresh, t]
  );

  /**
   * One request, not a loop. The backend charges the rate limit once for the
   * batch and walks the graph in dependency order with its own idempotency key
   * per node, so a partial failure cannot double-pay or leave a hole.
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
      } else if (result.retryAfterSeconds) {
        const message = t('claim.rate_limited');
        setAnnouncement(message);
        toast.error(message);
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
    const nodeId = celebrating;
    setCelebrating(null);
    if (!nodeId) return;
    // Persisted server-side so the animation does not replay on another device.
    await api.post('/journey/celebrate', { nodeId }).catch(() => undefined);
    setData((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId ? { ...node, celebrationPending: false } : node
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

  /** The thread the server's recommended step belongs to. */
  const recommendedTrackId = useMemo(
    () =>
      data.nodes.find((node) => node.id === data.recommendedNodeId)?.track ??
      null,
    [data.nodes, data.recommendedNodeId]
  );

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

      {/*
        The track bar that used to sit here is gone: the map is seven nodes and
        every one of them is a track, so a second row of the same seven names
        above it was the page telling you the same thing twice.
      */}
      <section
        className='bg-card/40 rounded-2xl border p-4 sm:p-6'
        // Clicking empty canvas closes the drawer; clicks on a node stop
        // propagation implicitly by re-selecting.
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedNode(null);
        }}
      >
        <JourneyGraph
          data={data}
          threads={threads}
          selectedTrackId={selectedThread?.track.id ?? null}
          recommendedTrackId={recommendedTrackId}
          onSelect={setSelectedNode}
        />
      </section>

      <NodeDrawer
        thread={selectedThread}
        data={data}
        onClose={() => setSelectedNode(null)}
        onClaim={claim}
        claimingNodeId={claimingNode}
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
