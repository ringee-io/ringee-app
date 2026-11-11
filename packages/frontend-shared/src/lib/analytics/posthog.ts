"use client";

import posthog, { type CaptureResult } from "posthog-js";
import {
  CLIENT_ANALYTICS_EVENTS,
  CLIENT_ANALYTICS_SCHEMA_VERSION,
  CLIENT_ENVELOPE,
  type ClientAnalyticsEvent,
} from "./events";
import { redactText, sanitizeUrl, sanitizeValue } from "./sanitize";

/**
 * The dashboard's PostHog client (Stage 4B), owned by `useAnalytics`.
 *
 * - Public configuration only: the project key and ingestion host. No
 *   personal or management key ever reaches the browser.
 * - One identity with the backend: the internal user id, and the effective
 *   workspace as the `workspace` group — both from `GET /analytics/identity`.
 * - No autocapture, no session replay, no surveys, no flags, no automatic
 *   exception capture (Sentry owns uncaught errors in the browser): every
 *   event is an allowlisted one, and `before_send` sanitizes URLs once more.
 * - Pageviews are captured by `PostHogPageviews` alone, so the dashboard's
 *   gtag/Ahrefs pageviews and these never double up.
 *
 * Without `NEXT_PUBLIC_POSTHOG_KEY` nothing loads and every call is a no-op.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const ENVIRONMENT =
  process.env.NEXT_PUBLIC_RINGEE_ENVIRONMENT ||
  process.env.NEXT_PUBLIC_VERCEL_ENV ||
  process.env.NODE_ENV ||
  "development";
const RELEASE =
  process.env.NEXT_PUBLIC_RINGEE_RELEASE ||
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  "unversioned";

export const ANALYTICS_WORKSPACE_GROUP = "workspace";

export interface AnalyticsIdentity {
  distinctId: string;
  workspace: { key: string; type: "personal" | "organization" };
}

let started = false;
let identity: AnalyticsIdentity | null = null;

export function analyticsEnabled(): boolean {
  return typeof window !== "undefined" && Boolean(KEY);
}

/** Loads the SDK once, in the browser, when a project key is configured. */
export function ensureAnalytics(): boolean {
  if (!analyticsEnabled()) return false;
  if (started) return true;
  started = true;
  try {
    posthog.init(KEY!, {
      api_host: HOST,
      // Pageviews are captured explicitly (PostHogPageviews), leaves too.
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      rageclick: false,
      capture_performance: false,
      // Later, reviewed steps (Stage 4 §12): replay, surveys, flags.
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_conversations: true,
      disable_web_experiments: true,
      advanced_disable_flags: true,
      // Sentry owns uncaught browser errors; journeys capture their own.
      capture_exceptions: false,
      person_profiles: "identified_only",
      mask_all_text: true,
      mask_all_element_attributes: true,
      mask_personal_data_properties: true,
      ip: false,
      before_send: scrubEvent,
    });
    posthog.register({
      schema_version: CLIENT_ANALYTICS_SCHEMA_VERSION,
      actor_type: "human",
      environment: ENVIRONMENT,
      release_version: RELEASE,
    });
  } catch {
    // Telemetry never breaks the page.
  }
  return true;
}

/**
 * Applies the identity the server derived: the same human id the backend
 * facts carry, and the effective workspace group. A different person on the
 * same browser resets the previous identity first.
 */
export function applyAnalyticsIdentity(next: AnalyticsIdentity): void {
  if (!ensureAnalytics()) return;
  try {
    if (identity && identity.distinctId !== next.distinctId) {
      posthog.reset();
    }
    if (!identity || identity.distinctId !== next.distinctId) {
      posthog.identify(next.distinctId);
    }
    if (!identity || identity.workspace.key !== next.workspace.key) {
      posthog.group(ANALYTICS_WORKSPACE_GROUP, next.workspace.key, {
        workspace_type: next.workspace.type,
      });
    }
    identity = next;
  } catch {
    // Ignore: analytics is optional.
  }
}

/** Sign-out: the next person on this browser starts anonymous. */
export function clearAnalyticsIdentity(): void {
  if (!identity) return;
  identity = null;
  if (!started) return;
  try {
    posthog.reset();
  } catch {
    // Ignore.
  }
}

export function currentAnalyticsIdentity(): AnalyticsIdentity | null {
  return identity;
}

/** One allowlisted interaction or exposure, with its workspace. */
export function captureClientEvent(
  event: ClientAnalyticsEvent,
  properties: Record<string, unknown> = {},
): void {
  if (!ensureAnalytics()) return;
  try {
    const allowed = new Set<string>([
      ...CLIENT_ENVELOPE,
      ...CLIENT_ANALYTICS_EVENTS[event],
    ]);
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (!allowed.has(key)) continue;
      const sanitized = sanitizeValue(value);
      if (sanitized !== undefined) clean[key] = sanitized;
    }
    if (identity) {
      clean.workspace_key = identity.workspace.key;
      clean.workspace_type = identity.workspace.type;
    }
    posthog.capture(event, clean);
  } catch {
    // Ignore.
  }
}

/** A page view with a sanitized URL; called by `PostHogPageviews` only. */
export function capturePageview(): void {
  if (!ensureAnalytics()) return;
  try {
    posthog.capture("$pageview", {
      $current_url: sanitizeUrl(window.location.href),
      ...(identity
        ? {
            workspace_key: identity.workspace.key,
            workspace_type: identity.workspace.type,
          }
        : {}),
    });
  } catch {
    // Ignore.
  }
}

/** Where a journey exception happened, in bounded vocabulary. */
export interface ClientExceptionContext {
  component: string;
  operation: string;
  journeyStep: string;
  severity?: "warning" | "error" | "critical";
  /** A normalized code (`http_502`, `timeout`) — never a message. */
  errorCode?: string;
  /** Opaque, authorized correlation ids. */
  correlation?: Record<string, string | null | undefined>;
}

/**
 * A technical failure of a scoped journey (number lookup, first call,
 * booking, AI activation). Not for expected blockers. The message and stack
 * are redacted before the SDK sees them; Sentry keeps owning uncaught errors.
 */
export function captureClientException(
  error: unknown,
  context: ClientExceptionContext,
): void {
  if (!ensureAnalytics()) return;
  try {
    const source = error instanceof Error ? error : new Error(String(error));
    const copy = new Error(redactText(source.message));
    copy.name = /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(source.name)
      ? source.name
      : "Error";
    copy.stack = (source.stack ?? "")
      .split("\n")
      .slice(0, 30)
      .map((line) =>
        line.trimStart().startsWith("at ")
          ? line.replace(/\?[^:)\s]*/g, "")
          : redactText(line),
      )
      .join("\n");
    const correlation: Record<string, string> = {};
    for (const [key, value] of Object.entries(context.correlation ?? {})) {
      if (/^[a-z_]{1,32}$/.test(key) && typeof value === "string" && value) {
        const clean = sanitizeValue(value);
        if (typeof clean === "string")
          correlation[`correlation_${key}`] = clean;
      }
    }
    posthog.captureException(copy, {
      runtime: "browser",
      component: bounded(context.component),
      operation: bounded(context.operation),
      journey_step: bounded(context.journeyStep),
      severity: context.severity ?? "error",
      error_code: bounded(context.errorCode ?? normalizeCode(error)),
      ...(identity
        ? {
            workspace_key: identity.workspace.key,
            workspace_type: identity.workspace.type,
          }
        : {}),
      ...correlation,
    });
  } catch {
    // Ignore.
  }
}

function bounded(value: string): string {
  const clean = value.trim().slice(0, 64);
  return /^[A-Za-z0-9_.:-]+$/.test(clean) ? clean : "unspecified";
}

function normalizeCode(error: unknown): string {
  const candidate = error as {
    status?: unknown;
    code?: unknown;
    name?: unknown;
  };
  if (typeof candidate?.status === "number") return `http_${candidate.status}`;
  if (
    typeof candidate?.code === "string" &&
    /^[a-z_]{2,40}$/i.test(candidate.code)
  ) {
    return candidate.code;
  }
  if (typeof candidate?.name === "string") return bounded(candidate.name);
  return "unknown";
}

/** The last pass over every outgoing event: URLs and exception messages. */
function scrubEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  const properties = { ...(event.properties ?? {}) } as Record<string, unknown>;
  for (const key of [
    "$current_url",
    "$referrer",
    "$initial_referrer",
    "$initial_current_url",
    "$prev_pageview_pathname",
  ]) {
    const value = properties[key];
    if (typeof value === "string" && value.startsWith("http")) {
      properties[key] = sanitizeUrl(value);
    }
  }
  if (typeof properties.$pathname === "string") {
    try {
      properties.$pathname = new URL(
        sanitizeUrl(`https://x${properties.$pathname}`),
      ).pathname;
    } catch {
      properties.$pathname = "[path]";
    }
  }
  const list = properties.$exception_list;
  if (Array.isArray(list)) {
    properties.$exception_list = list.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const item = { ...(entry as Record<string, unknown>) };
      if (typeof item.value === "string") item.value = redactText(item.value);
      return item;
    });
  }
  // Snapshot of the DOM, chain of elements: never needed, never sent.
  delete properties.$elements;
  delete properties.$elements_chain;
  return { ...event, properties } as CaptureResult;
}
