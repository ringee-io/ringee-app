"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "./use.api";
import {
  analyticsEnabled,
  applyAnalyticsIdentity,
  clearAnalyticsIdentity,
  type AnalyticsIdentity,
} from "../lib/analytics/posthog";

/**
 * Keeps the PostHog identity in step with the session (Stage 4B): the same
 * internal user id the backend reports with, and the effective workspace as
 * the `workspace` group — re-read whenever the person or the active
 * organization changes, so every later event carries the workspace it was
 * captured in. Signing out resets it. Mounted once, in the dashboard shell.
 */
export function useAnalyticsIdentity(): void {
  const { isLoaded, isSignedIn, userId, orgId } = useAuth();
  const api = useApi();

  useEffect(() => {
    if (!analyticsEnabled() || !isLoaded) return;
    if (!isSignedIn) {
      clearAnalyticsIdentity();
      return;
    }
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
}
