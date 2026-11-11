"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "./use.api";
import {
  analyticsEnabled,
  applyAnalyticsIdentity,
  clearAnalyticsIdentity,
  clearAnalyticsWorkspace,
  type AnalyticsIdentity,
} from "../lib/analytics/posthog";

/**
 * Keeps the PostHog identity in step with the session (Stage 4B): the same
 * internal user id the backend reports with, and the effective workspace as
 * the `workspace` group — re-read whenever the person or the active
 * organization changes, so every later event carries the workspace it was
 * captured in. Until the new identity arrives, events carry no workspace
 * rather than the one being left. Signing out resets it. Mounted once, in the
 * dashboard shell, which owns it: when the shell unmounts — signing out
 * removes it — the identity ends with it, so pages outside the dashboard
 * never carry this person or their workspace.
 */
export function useAnalyticsIdentity(): void {
  const { isLoaded, isSignedIn, userId, orgId } = useAuth();
  const api = useApi();
  // The person whose identity was asked for last: another person starts
  // anonymous, the same person switching workspace keeps their identity.
  const requestedFor = useRef<string | null>(null);

  // A layout effect: the workspace being left is cleared in the commit that
  // switches it, before any passive effect of that commit — the pages' own,
  // which run before this shell's — can capture an event with it. Each run's
  // `cancelled` drops the answer to an earlier run's request.
  useLayoutEffect(() => {
    if (!analyticsEnabled() || !isLoaded) return;
    if (!isSignedIn) {
      requestedFor.current = null;
      clearAnalyticsIdentity();
      return;
    }
    if (requestedFor.current && requestedFor.current !== userId) {
      clearAnalyticsIdentity();
    } else {
      clearAnalyticsWorkspace();
    }
    requestedFor.current = userId ?? null;
    let cancelled = false;
    api
      .get<AnalyticsIdentity>("/analytics/identity")
      .then((identity) => {
        if (!cancelled && identity?.distinctId && identity.workspace?.key) {
          applyAnalyticsIdentity(identity);
        }
      })
      .catch(() => {
        // Without an identity events stay anonymous; nothing else changes.
      });
    return () => {
      cancelled = true;
    };
    // `api` is stable per session; the identity depends on who and where.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, userId, orgId]);

  useEffect(
    () => () => {
      requestedFor.current = null;
      clearAnalyticsIdentity();
    },
    [],
  );
}
