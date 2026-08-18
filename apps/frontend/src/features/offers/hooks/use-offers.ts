'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useOffersApi, type Offer, type OfferPlacement } from '../api';

/** Long enough not to chatter, short enough to appear soon after unlocking. */
const REFRESH_MS = 5 * 60 * 1000;

/**
 * Offers the user waved away with the "x", for this page load only.
 *
 * "Not now" is not "never": an offer stays on the table until it is redeemed or
 * pulled from the catalogue, so a reload brings it back. Module state rather
 * than component state because `load()` re-runs on an interval and would
 * otherwise resurrect the banner a few minutes after it was closed.
 */
const hiddenUntilReload = new Set<string>();

/**
 * Offers for one placement.
 *
 * The hook never decides what is shown — it renders whatever the backend
 * returns for this placement, already ordered by priority. `limit` is how many
 * slots the surface has (TOP_BANNER has one).
 */
export function useOffers(placement: OfferPlacement, limit?: number) {
  const api = useOffersApi();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await api.listAvailable({ placement, limit });
      if (mounted.current) {
        setOffers(
          (res?.offers ?? []).filter(
            (offer) => !hiddenUntilReload.has(offer.id)
          )
        );
      }
    } catch {
      // An offer is never essential: on failure show nothing rather than an error.
      if (mounted.current) setOffers([]);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [api, placement, limit]);

  useEffect(() => {
    mounted.current = true;
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [load]);

  /** Applies a server response for one offer without a full refetch. */
  const replace = useCallback((updated: Offer) => {
    setOffers((current) =>
      current.map((offer) => (offer.id === updated.id ? updated : offer))
    );
  }, []);

  /** Hides an offer for the rest of this page load. See `hiddenUntilReload`. */
  const remove = useCallback((offerId: string) => {
    hiddenUntilReload.add(offerId);
    setOffers((current) => current.filter((offer) => offer.id !== offerId));
  }, []);

  return { offers, loading, reload: load, replace, remove };
}
