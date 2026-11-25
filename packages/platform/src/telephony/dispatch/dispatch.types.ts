import { HttpException, HttpStatus } from "@nestjs/common";
import type { ProviderAccountRef } from "./provider-account";
import type {
  DispatchSource,
  TrafficClass,
  TrafficLevel,
} from "./traffic-class";
import type { CpsMode } from "./dispatch-settings";

/** One outbound call attempt asking for provider capacity. */
export interface DispatchRequest {
  /** Declared by the call site, never by a client. */
  source: DispatchSource;
  /**
   * The workspace the attempt is for. It selects the workspace's own automated
   * clock (levels 1-3) and nothing else. Keyed by `workspaceKeyOf`, so a
   * personal workspace and an organization never share a clock (WRK-001).
   */
  workspace?: { userId: string; organizationId?: string | null } | null;
  /** Overrides the source's class; used by tests and by the backoffice map. */
  cls?: TrafficClass;
  /** Deduplicates preliminary admission only; actual egress always needs capacity. */
  idempotencyRef?: string;
  /**
   * The grant is the start itself: a client (the browser, the extension, the
   * SDK, a campaign assignment) dials the leg right after it, and nothing of
   * that leg passes the Telnyx client. It is taken from the egress clocks, the
   * ones every server-originated start spends at the Telnyx client, so a
   * client's dial and a server's dial draw on one account budget. It is never
   * counted here: the leg is counted when its webhook arrives
   * (`observeExternalAttempt`).
   */
  directStart?: boolean;
  /** Server-owned queue deadline; never dispatch an operation after it. */
  expiresAtMs?: number;
  /**
   * Count the attempt in the per-second statistics. `false` for a person's
   * pre-flight: the browser dials later, and that leg is counted when its
   * webhook arrives, not twice.
   */
  countAttempt?: boolean;
  /** How long to wait for capacity; the class's own bound when omitted. */
  maxWaitMs?: number;
}

export type DeferralReason =
  | "busy"
  | "workspace_busy"
  | "paused"
  | "expired"
  | "coordination_unavailable";

/** The right to make exactly one outbound provider attempt. */
export interface DispatchPermit {
  readonly id: string;
  readonly account: ProviderAccountRef;
  readonly cls: TrafficClass;
  readonly level: TrafficLevel;
  readonly source: DispatchSource;
  readonly workspaceKey: string | null;
  /** What was asked for, so a second request under this permit is paced alike. */
  readonly request: DispatchRequest;
  readonly grantedAtMs: number;
  /** The grant already counted the attempt; egress must not count it again. */
  readonly counted: boolean;
  /** Granted although the clocks were busy: only ever for a waiting person. */
  readonly overage: boolean;
  /** An observation-only permit granted without coordination; never an enforcement fallback. */
  readonly degraded: boolean;
  readonly mode: CpsMode;
  /** A permit pays for one provider request; set when it has been used. */
  consumed: boolean;
}

export type DispatchDecision =
  | { granted: true; permit: DispatchPermit; waitedMs: number }
  | {
      granted: false;
      reason: DeferralReason;
      retryAfterMs: number;
      waitedMs: number;
    };

/**
 * A provider request was refused BEFORE it was sent because outbound capacity
 * is short. Nothing was dialed, so the caller may retry later; it is a 429 so
 * an HTTP surface that lets it through answers honestly.
 */
export class ProviderDispatchDeferredError extends HttpException {
  constructor(
    readonly reason: DeferralReason,
    readonly retryAfterMs: number,
  ) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: "Too Many Requests",
        code: "dispatch_deferred",
        reason,
        retryAfterMs,
        message: `Outbound call capacity is fully used (${reason}). Nothing was dialed; retry in ${Math.ceil(retryAfterMs / 1000)}s.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    this.name = ProviderDispatchDeferredError.name;
  }
}

/**
 * A provider request that starts a call got no answer saying whether it did: a
 * timeout, a dropped connection, a 5xx. A leg may exist, so it is not a failed
 * dial: the caller must not start another leg for the same purpose until this
 * one is reconciled, through the webhooks that find the row written before the
 * request. The provider's status and body are kept, so code that reads them
 * sees what it always saw.
 */
export class CallOriginationUncertainError extends HttpException {
  constructor(cause: HttpException) {
    super(cause.getResponse(), cause.getStatus(), { cause });
    this.message = cause.message;
    this.name = CallOriginationUncertainError.name;
  }
}

/** What the services layer lends the platform at runtime. */
export interface DispatchAlert {
  key: string;
  severity: "warning" | "critical";
  title: string;
  detail: Record<string, unknown>;
}

export type DispatchAlertSink = (alert: DispatchAlert) => void | Promise<void>;
export type DispatchSettingsSource = () => Promise<Record<string, unknown>>;
