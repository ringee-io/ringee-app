"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { RealtimeClientKind, RealtimeServerEvent } from "./contracts";
import {
  RealtimeConnectionStatus,
  UserEventsClient,
} from "./user-events-client";

export interface UseUserEventsOptions {
  /** Fires for every server event. Kept in a ref, so it may change freely. */
  onEvent: (event: RealtimeServerEvent) => void;
  client?: RealtimeClientKind;
  /** Set to false to keep the socket closed (e.g. on unauthenticated routes). */
  enabled?: boolean;
}

/**
 * Holds one realtime socket for the signed-in user, for the lifetime of the
 * component that mounts it. Mount it ONCE per app shell — a second mount opens
 * a second socket and shows up as a duplicate device in the backoffice.
 *
 * The socket is deliberately tied to the Clerk user id and nothing else: it
 * survives navigation, org switches and token refreshes, and is torn down only
 * on sign-out or unmount.
 */
export function useUserEvents({
  onEvent,
  client = "web",
  enabled = true,
}: UseUserEventsOptions): RealtimeConnectionStatus {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const [status, setStatus] = useState<RealtimeConnectionStatus>("idle");

  // The handler and the token getter are read through refs so that a new
  // closure on every render never tears the socket down and back up.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    if (!enabled || !isLoaded || !isSignedIn || !userId) return;

    const socketClient = new UserEventsClient({
      getToken: () => getTokenRef.current(),
      client,
      onEvent: (event) => onEventRef.current(event),
      onStatusChange: setStatus,
    });
    socketClient.connect();

    return () => socketClient.disconnect();
  }, [enabled, isLoaded, isSignedIn, userId, client]);

  return status;
}
