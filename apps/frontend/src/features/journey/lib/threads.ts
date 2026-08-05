import type {
  JourneyNode,
  JourneyNodeStatus,
  JourneyOverview,
  JourneyTrack,
  JourneyTrackId
} from '../types';

/**
 * Threads: one map node per track.
 *
 * The map used to draw all 27 program steps. That is the truth, and it was
 * unreadable — a wall of boxes where the only way to find out what any of them
 * wanted was to click it anyway. A thread is the same information at the
 * altitude a person actually decides at: *is this how I sell?* The steps do not
 * disappear; they become the checklist inside the thread, which is where
 * "what does this take" belongs.
 *
 * This file **aggregates**, it does not decide. Every status, every reward
 * state, every blocker is the server's; all that happens here is roll-up:
 * a thread is complete when the server says its track is complete, and it is
 * locked when the server says every one of its steps is locked. If a product
 * rule ever needs to be *invented* to fill this in, it belongs in
 * `packages/services/.../journey/` instead, and the API should ship it.
 */

export interface JourneyThread {
  track: JourneyTrack;
  /**
   * The synthesized map node. Shaped exactly like a program node so the layout
   * and the node component do not need to know threads exist.
   */
  node: JourneyNode;
  /** The program steps behind it, in dependency order. */
  steps: JourneyNode[];
  stepsDone: number;
  stepsTotal: number;
  /** Money that can be claimed right now, across the thread. */
  claimableCents: number;
  /** Money not yet paid out at all — claimable plus still-to-earn. */
  remainingCents: number;
}

/** Rewards in these states have already moved; they are not "still available". */
const PAID = new Set(['claimed', 'legacy_claimed']);

export function buildThreads(data: JourneyOverview): JourneyThread[] {
  const byTrack = new Map<string, JourneyNode[]>();
  for (const node of data.nodes) {
    const list = byTrack.get(node.track);
    if (list) list.push(node);
    else byTrack.set(node.track, [node]);
  }

  return [...data.tracks]
    .sort((a, b) => a.order - b.order)
    .map((track) => {
      const steps = (byTrack.get(track.id) ?? [])
        .slice()
        .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));

      const stepsDone = steps.filter((s) => s.status === 'achieved').length;

      const claimableCents = steps.reduce(
        (sum, step) =>
          sum +
          (step.reward?.status === 'claimable' ? step.reward.amountCents : 0),
        0
      );
      const remainingCents = steps.reduce(
        (sum, step) =>
          sum +
          (step.reward && !PAID.has(step.reward.status)
            ? step.reward.amountCents
            : 0),
        0
      );

      // Which *other threads* this one waits on. Derived from the steps' own
      // cross-track dependencies, so it can never disagree with the graph the
      // server sent.
      const dependsOn = [
        ...new Set(
          steps.flatMap((step) =>
            step.dependsOn
              .map((id) => data.nodes.find((n) => n.id === id)?.track)
              .filter(
                (id): id is JourneyTrackId => Boolean(id) && id !== track.id
              )
          )
        )
      ];

      const status = threadStatus(track, steps);

      const blockedBy =
        status === 'locked'
          ? [
              ...new Set(
                steps.flatMap((step) =>
                  step.blockedBy
                    .map((id) => data.nodes.find((n) => n.id === id)?.track)
                    .filter(
                      (id): id is JourneyTrackId =>
                        Boolean(id) && id !== track.id
                    )
                )
              )
            ]
          : [];

      const node: JourneyNode = {
        id: track.id,
        track: track.id,
        status,
        optional: false,
        depth: 0,
        requirements: [],
        completed: track.satisfied,
        total: track.needed,
        progressPct: track.needed
          ? Math.min(100, Math.round((track.satisfied / track.needed) * 100))
          : 0,
        dependsOn,
        unlocks: [],
        blockedBy,
        reward: remainingCents
          ? {
              amountCents: remainingCents,
              currency: 'USD',
              status: claimableCents ? 'claimable' : 'locked',
              claimedAt: null
            }
          : null,
        achievedAt: null,
        celebrationPending: false
      };

      return {
        track,
        node,
        steps,
        stepsDone,
        stepsTotal: steps.length,
        claimableCents,
        remainingCents
      };
    });
}

/**
 * Roll-up, in the only order that cannot contradict the server: the track's own
 * completion rule wins, then the strongest state any step is in.
 */
function threadStatus(
  track: JourneyTrack,
  steps: JourneyNode[]
): JourneyNodeStatus {
  if (track.complete) return 'achieved';
  if (
    steps.some((s) => s.status === 'in_progress' || s.status === 'achieved')
  ) {
    return 'in_progress';
  }
  if (steps.some((s) => s.status === 'available')) return 'available';
  return 'locked';
}

/** The thread a given id belongs to, whether the id is a thread or a step. */
export function findThread(
  threads: JourneyThread[],
  id: string | null
): JourneyThread | null {
  if (!id) return null;
  return (
    threads.find((thread) => thread.track.id === id) ??
    threads.find((thread) => thread.steps.some((step) => step.id === id)) ??
    null
  );
}
