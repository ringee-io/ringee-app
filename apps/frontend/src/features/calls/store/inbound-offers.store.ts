'use client';

import { create } from 'zustand';
import type {
  RealtimeInboundCallCancelledEvent,
  RealtimeInboundCallRingingEvent
} from '@ringee/frontend-shared/realtime';
import { useTelnyxStore } from './telnyx.store';

/**
 * How long a freshly arrived SIP offer waits for the server to name its
 * recipient before it is given up on.
 *
 * The provider forks the INVITE the moment the call reaches the connection,
 * while `call.inbound.ringing` only goes out once the webhook has created the
 * call row and resolved its route — so the leg almost always arrives first.
 * The window is generous compared with that work and small compared with the
 * shortest ring (`USER_RING_SECONDS` is 45s), so a slow backend rings late
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
 * The offer a SIP leg belongs to.
 *
 * The dialled number identifies the offer on its own in every real case; the
 * caller is used to disambiguate two calls ringing the same number at once,
 * and the oldest candidate wins when the caller is withheld or spelled
 * differently by the carrier.
 */
function matchOffer(
  offers: InboundOffer[],
  to: string,
  from: string
): InboundOffer | null {
  const candidates = offers.filter(
    (offer) => digits(offer.toNumber) === digits(to)
  );
  if (!candidates.length) return null;
  return (
    candidates.find((offer) => digits(offer.fromNumber) === digits(from)) ??
    candidates[0]
  );
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
 * never be handed the same one — or with `null` when the window closes without
 * the call being named for this user.
 */
export function awaitInboundOffer(
  telnyxCallId: string,
  leg: { to: string; from: string },
  timeoutMs = INBOUND_OFFER_GRACE_MS
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

  const immediate = look();
  if (immediate) return Promise.resolve(bind(immediate));

  return new Promise((resolve) => {
    const settle = (offer: InboundOffer | null) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(bind(offer));
    };
    const timer = setTimeout(() => settle(null), timeoutMs);
    const unsubscribe = useInboundOffersStore.subscribe(() => {
      const found = look();
      if (found) settle(found);
    });
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
  useInboundOffersStore.setState({ pending: [], presented: {} });
}
