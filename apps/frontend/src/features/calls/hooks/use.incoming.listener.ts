'use client';

import { useEffect, useRef } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import type { ApiClient } from '@ringee/frontend-shared/lib/api';
import { useTelnyxStore } from '../store/telnyx.store';
import {
  awaitInboundOffer,
  isInboundRealtimeConnected,
  useInboundOffersStore,
  type InboundOffer,
  releaseInboundOffer
} from '../store/inbound-offers.store';

import { controlledInboundLegs } from './use.telnyx';

const RINGING_STATES = ['ringing', 'trying', 'requesting'];

/** Legs remembered before the set is dropped — a tab left open for days. */
const MAX_REMEMBERED_LEGS = 200;

const digits = (value: string | null | undefined) =>
  (value ?? '').replace(/\D/g, '');

/**
 * Decides which inbound SIP legs this browser puts on screen.
 *
 * Every dashboard registers with the same WebRTC credential, so the provider
 * offers every inbound call to every browser (`DEBT-020`). What makes a leg
 * *ours* is the server saying so on the per-user realtime channel: it resolves
 * the number's route, names the members it rings — a ring group included — and
 * publishes `call.inbound.ringing` to them and nobody else.
 *
 * So the offer is the gate. The old check — "is the dialled number in my own
 * number list" — cannot express a ring group at all: every member of a
 * workspace sees the workspace's numbers, so it rang people the call was never
 * routed to. It survives below for exactly one case, the realtime channel
 * being down, because an inbound call that never rings is a worse failure than
 * one that rings the way it did before, and that check is no weaker than what
 * shipped.
 *
 * Presenting a call is not the same as winning it: the answer is claimed
 * server-side (`InboundCallController`), so nothing here is a boundary.
 */
export function useIncomingListener() {
  const api = useApi();
  const notification = useTelnyxStore((s) => s.notification);
  /** Legs already put on screen, so repeated `callUpdate`s present once. */
  const decided = useRef(new Set<string>());
  /**
   * Legs being decided right now, so one leg is never asked about twice, and
   * the handle that abandons each.
   */
  const deciding = useRef(new Map<string, AbortController>());

  // A match can wait for as long as its leg rings. A listener that is torn
  // down — or rebuilt around another api client — abandons every match it
  // started, so none of them can put an old call in the shared queue after it.
  // Not the effect below: that one re-runs on every notification, and a
  // ringing leg sends no further `callUpdate` to be asked about again on.
  useEffect(() => {
    const inFlight = deciding.current;
    return () => {
      for (const match of inFlight.values()) match.abort();
      inFlight.clear();
    };
  }, [api]);

  useEffect(() => {
    if (!notification) return;
    if (notification.type !== 'callUpdate' || !notification.call) return;

    const call = TelnyxRTC.telnyxStateCall(notification.call);
    const { state, direction, options } = call;

    const isIncoming =
      RINGING_STATES.includes(state) &&
      (direction === 'inbound' ||
        (options?.remoteCallerNumber &&
          options?.destinationNumber &&
          options.remoteCallerNumber !== options.destinationNumber));

    if (!isIncoming || !call.id) return;
    if (decided.current.has(call.id) || deciding.current.has(call.id)) return;
    const match = new AbortController();
    deciding.current.set(call.id, match);

    void (async () => {
      try {
        const ours = controlledInboundLegs.has(call.id)
          ? await resolveControlledOffer(
              api,
              call.id,
              call.telnyxIDs?.telnyxCallControlId,
              () => RINGING_STATES.includes(call.state),
              match.signal
            )
          : await isOursToPresent(
              api,
              call.id,
              {
                to: options?.destinationNumber ?? '',
                from: options?.remoteCallerNumber ?? '',
                // The provider updates the leg in place, so this is its live state.
                isRinging: () => RINGING_STATES.includes(call.state)
              },
              match.signal
            );
        // Abandoned while it waited: this listener no longer owns the queue.
        if (match.signal.aborted) return;
        // Not ours. The wait lasts as long as the leg rings — a ringing leg
        // sends no further `callUpdate` to be asked about again on — so an
        // offer that arrived late, or one that could not be told apart from
        // another call's until that one was taken, has already been matched.
        // What gets here unmatched is over, or somebody else's.
        if (!ours) return;
        if (!RINGING_STATES.includes(call.state))
          return releaseInboundOffer(call.id);
        if (decided.current.size >= MAX_REMEMBERED_LEGS)
          decided.current.clear();
        decided.current.add(call.id);
        useTelnyxStore.getState().enqueue(call);
      } finally {
        // Only its own entry: a rebuilt listener may be deciding the leg anew.
        if (deciding.current.get(call.id) === match)
          deciding.current.delete(call.id);
      }
    })();
  }, [notification, api]);
}

async function isOursToPresent(
  api: ApiClient,
  telnyxCallId: string,
  leg: { to: string; from: string; isRinging: () => boolean },
  signal: AbortSignal
): Promise<boolean> {
  if (isInboundRealtimeConnected()) {
    const offer = await awaitInboundOffer(telnyxCallId, leg, { signal });
    if (offer) return true;
    // Nothing came while the leg rang. With the channel still up that is
    // itself the answer: the server routed this call to somebody else. Only a
    // channel that dropped while we waited falls through to the legacy check.
    if (signal.aborted || isInboundRealtimeConnected()) return false;
  }
  return ownsDialledNumber(api, leg.to);
}

/** Pre-routing behavior: ring for any number this workspace owns. */
async function ownsDialledNumber(api: ApiClient, to: string): Promise<boolean> {
  const numbers = await api
    .get<{ phoneNumber: string }[]>('/telephony/phone-numbers')
    .catch(() => [] as { phoneNumber: string }[]);
  return numbers.some((n) => digits(n.phoneNumber) === digits(to));
}

/** Resolve by the actual media leg, so simultaneous calls cannot bind by caller number. */
async function resolveControlledOffer(
  api: ApiClient,
  localId: string,
  controlId: string | undefined,
  isRinging: () => boolean,
  signal: AbortSignal
) {
  if (!controlId) return false;
  while (!signal.aborted && isRinging()) {
    try {
      const result = await api.get<InboundOffer & { ringSeconds: number }>(
        `/inbound-calls/legs/${encodeURIComponent(controlId)}`
      );
      if (signal.aborted || !isRinging()) return false;
      const offer = {
        ...result,
        expiresAt: Date.now() + result.ringSeconds * 1000
      };
      useInboundOffersStore.setState((state) => ({
        pending: state.pending.filter((p) => p.callId !== offer.callId),
        presented: { ...state.presented, [localId]: offer }
      }));
      return true;
    } catch {
      // A provider INVITE can beat the server's persisted dial response.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return false;
}
