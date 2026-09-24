'use client';

import { create } from 'zustand';
import type {
  RealtimeInboundCallCancelledEvent,
  RealtimeInboundCallRingingEvent
} from '@ringee/frontend-shared/realtime';
import { useTelnyxStore } from './telnyx.store';

/**
 * How long a freshly arrived SIP leg waits on a realtime channel that is down
 * before it falls back to the number check.
 *
 * The provider forks the INVITE the moment the call reaches the connection,
 * while `call.inbound.ringing` only goes out once the webhook has created the
 * call row and resolved its route — so the leg almost always arrives first.
 * With the channel up there is no deadline at all: the leg stays matchable for
 * as long as it rings, so a slow backend — or a retried webhook — rings late
 * rather than not at all.
 */
export const INBOUND_OFFER_GRACE_MS = 8_000;

/** An inbound call the server has said belongs to this user. */
export interface InboundOffer {
  callId: string;
  /** What the answer is claimed against. Empty only if the provider gave none. */
  callControlId: string;
  toNumber: string;
  fromNumber: string;
  callerName: string | null;
  destinationType: 'user' | 'ring_group' | 'desk_phone';
  ringGroupId: string | null;
  ringGroupName: string | null;
  /** Epoch ms at which the server gives up on this destination. */
  expiresAt: number;
}

interface InboundOffersState {
  /** Offers named for this user that no local SIP leg has been matched to yet. */
  pending: InboundOffer[];
  /** Offers bound to the Telnyx call that is presenting them, by that call's id. */
  presented: Record<string, InboundOffer>;
  /** Whether the realtime channel that carries the offers is up. */
  connected: boolean;
}

export const useInboundOffersStore = create<InboundOffersState>()(() => ({
  pending: [],
  presented: {},
  connected: false
}));

/** Compare the way the two sides spell a number: E.164 here, bare digits in SIP. */
const digits = (value: string | null | undefined) =>
  (value ?? '').replace(/\D/g, '');

const unexpired = (offers: InboundOffer[], now: number) =>
  offers.filter((offer) => offer.expiresAt > now);

/**
 * How long a cancelled call is remembered. Longer than any ring window, so a
 * `ringing` event that lost the race with its own cancellation — the two are
 * published by whichever API instance got there first, and the fan-out is not
 * instant — cannot queue an offer for a call that is already over. A stale
 * offer is not harmless: it sits in `pending` for the whole ring window, where
 * the next call to the same number can be refused as ambiguous against it.
 */
const CANCELLED_TOMBSTONE_MS = 60_000;

/** Calls the server has cancelled, by call id, until the given epoch ms. */
const cancelledCalls = new Map<string, number>();

function tombstone(callId: string): void {
  const now = Date.now();
  for (const [id, until] of cancelledCalls)
    if (until <= now) cancelledCalls.delete(id);
  cancelledCalls.set(callId, now + CANCELLED_TOMBSTONE_MS);
}

function isCancelled(callId: string): boolean {
  const until = cancelledCalls.get(callId);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  cancelledCalls.delete(callId);
  return false;
}

/**
 * The offer a SIP leg belongs to, or `null` when it cannot be said which.
 *
 * The dialled number identifies the offer on its own in every real case, and
 * the caller disambiguates two calls ringing the same number at once. What is
 * refused is a guess: binding a leg to the wrong offer hands the answer a
 * different call's `callControlId`, so it would claim — and cancel the other
 * endpoints of — a call the user is not on. An unmatched leg is retried on the
 * next event instead, and the ambiguity usually resolves itself within the
 * window as the other call is taken or cancelled.
 */
function matchOffer(
  offers: InboundOffer[],
  to: string,
  from: string
): InboundOffer | null {
  const candidates = offers.filter(
    (offer) => digits(offer.toNumber) === digits(to)
  );
  const exact = candidates.filter(
    (offer) => digits(offer.fromNumber) === digits(from)
  );
  if (exact.length === 1) return exact[0];
  // One offer for this number and no exact caller match is not ambiguous: the
  // carrier spells a withheld or odd caller id differently on the two sides.
  if (candidates.length === 1) return candidates[0];
  return null;
}

/**
 * Route a realtime inbound event into the store.
 *
 * Exported as a plain function so the single realtime socket — which is
 * mounted once, in the authenticated shell — can hand events over without the
 * shell having to know anything about how calls are presented.
 */
export function applyInboundRealtimeEvent(
  event: RealtimeInboundCallRingingEvent | RealtimeInboundCallCancelledEvent
): void {
  if (event.type === 'call.inbound.ringing') {
    // Already cancelled: this offer is a straggler, not a new call.
    if (isCancelled(event.callId)) return;
    const now = Date.now();
    const { presented } = useInboundOffersStore.getState();
    // A redelivered offer for a call already on screen changes nothing. Left
    // unguarded it would queue a second offer that a second leg could bind to.
    if (Object.values(presented).some((o) => o.callId === event.callId)) return;

    const offer: InboundOffer = {
      callId: event.callId,
      callControlId: event.callControlId,
      toNumber: event.toNumber,
      fromNumber: event.fromNumber,
      callerName: event.callerName,
      destinationType: event.destinationType,
      ringGroupId: event.ringGroupId,
      ringGroupName: event.ringGroupName,
      expiresAt: now + event.ringSeconds * 1_000
    };
    useInboundOffersStore.setState((state) => ({
      // Same call, newer offer: replace it rather than ring twice.
      pending: [
        ...unexpired(state.pending, now).filter(
          (pending) => pending.callId !== offer.callId
        ),
        offer
      ]
    }));
    return;
  }

  stopPresenting(event.callId);
}

/**
 * Stop offering a call: somebody else took it, the caller left, or the
 * destination was given up on. The leg itself is the provider's to cancel —
 * all this does is take the call off this user's screen.
 */
function stopPresenting(callId: string): void {
  tombstone(callId);
  const { presented } = useInboundOffersStore.getState();
  const telnyxCallIds = Object.keys(presented).filter(
    (id) => presented[id].callId === callId
  );

  useInboundOffersStore.setState((state) => {
    const next = { ...state.presented };
    for (const id of telnyxCallIds) delete next[id];
    return {
      pending: state.pending.filter((offer) => offer.callId !== callId),
      presented: next
    };
  });

  // Leaving the queue is what dismisses the toast, so every way a call stops
  // being presented — cancelled, answered, declined — goes through one path.
  for (const id of telnyxCallIds) useTelnyxStore.getState().dequeue(id);
}

/** Is the courier that names inbound recipients up right now? */
export function isInboundRealtimeConnected(): boolean {
  return useInboundOffersStore.getState().connected;
}

export function setInboundRealtimeConnected(connected: boolean): void {
  useInboundOffersStore.setState({ connected });
}

/**
 * Wait for the server to say this SIP leg is ours, and bind the two together.
 *
 * Resolves with the offer — already bound to `telnyxCallId`, so two legs can
 * never be handed the same one — or with `null` once the leg stops ringing
 * without the call being named for this user, or once the grace window has
 * passed with the realtime channel down.
 *
 * The wait is not a fixed window because the answer is not final until the leg
 * is: an offer that arrives late, or that only stops being ambiguous when
 * another call to the same number is taken, still binds while the leg rings.
 * `isRinging` is read live — the provider updates the leg in place — on every
 * change to either store, so a leg that ended is never bound to an offer.
 * Aborting `signal` ends the wait with `null` and binds nothing.
 */
export function awaitInboundOffer(
  telnyxCallId: string,
  leg: { to: string; from: string; isRinging: () => boolean },
  {
    signal,
    graceMs = INBOUND_OFFER_GRACE_MS
  }: { signal?: AbortSignal; graceMs?: number } = {}
): Promise<InboundOffer | null> {
  const bind = (offer: InboundOffer | null) => {
    if (!offer) return null;
    useInboundOffersStore.setState((state) => ({
      pending: state.pending.filter((p) => p.callId !== offer.callId),
      presented: { ...state.presented, [telnyxCallId]: offer }
    }));
    return offer;
  };

  const look = () =>
    matchOffer(
      unexpired(useInboundOffersStore.getState().pending, Date.now()),
      leg.to,
      leg.from
    );

  if (signal?.aborted || !leg.isRinging()) return Promise.resolve(null);
  const immediate = look();
  if (immediate) return Promise.resolve(bind(immediate));

  return new Promise((resolve) => {
    let graceOver = false;
    const settle = (offer: InboundOffer | null) => {
      clearTimeout(timer);
      stopOffers();
      stopLeg();
      signal?.removeEventListener('abort', abandon);
      resolve(bind(offer));
    };
    const abandon = () => settle(null);
    const check = () => {
      if (!leg.isRinging()) return settle(null);
      const found = look();
      if (found) return settle(found);
      // Only a channel that is down can no longer deliver the offer; the
      // caller falls back to the number check for it.
      if (graceOver && !isInboundRealtimeConnected()) settle(null);
    };
    const timer = setTimeout(() => {
      graceOver = true;
      check();
    }, graceMs);
    const stopOffers = useInboundOffersStore.subscribe(check);
    // Every provider notification lands in this store — the leg's own hangup
    // included — which is what ends the wait for a leg nobody named.
    const stopLeg = useTelnyxStore.subscribe(check);
    signal?.addEventListener('abort', abandon, { once: true });
  });
}

/** The offer a presented call belongs to, or `null` on the fallback path. */
export function useInboundOffer(telnyxCallId: string): InboundOffer | null {
  return useInboundOffersStore(
    (state) => state.presented[telnyxCallId] ?? null
  );
}

/** This call is no longer on screen; let go of what the server said about it. */
export function releaseInboundOffer(telnyxCallId: string): void {
  useInboundOffersStore.setState((state) => {
    if (!state.presented[telnyxCallId]) return state;
    const presented = { ...state.presented };
    delete presented[telnyxCallId];
    return { presented };
  });
}

/** Forget every offer — used when the dialer is torn down. */
export function clearInboundOffers(): void {
  cancelledCalls.clear();
  useInboundOffersStore.setState({ pending: [], presented: {} });
}
