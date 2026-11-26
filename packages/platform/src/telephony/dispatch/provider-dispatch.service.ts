import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { workspaceKeyOf } from "../../auth/ownership.types";
import { RedisService } from "../../redis/redis.service";
import {
  ProviderDispatchDeferredError,
  type DeferralReason,
  type DispatchAlert,
  type DispatchAlertSink,
  type DispatchDecision,
  type DispatchPermit,
  type DispatchRequest,
  type DispatchSettingsSource,
} from "./dispatch.types";
import {
  applySettingsOverrides,
  baselineSettings,
  deriveLimits,
  type DerivedLimits,
  type DispatchSettings,
} from "./dispatch-settings";
import { isCallOriginatingRequest } from "./egress-paths";
import { PROVIDER_DISPATCH_REDIS } from "./dispatch-redis";
import { RedisCpsLimiter, type AcquireInput } from "./redis-cps-limiter";
import {
  RingeeManagedAccountResolver,
  accountSlot,
  type ProviderAccountRef,
  type ProviderAccountResolver,
} from "./provider-account";
import {
  TRAFFIC_LEVEL,
  resolveTrafficClass,
  type TrafficClass,
  type TrafficLevel,
} from "./traffic-class";

/** The services layer registers its database-backed hooks here at startup. */
@Injectable()
export class DispatchRuntime {
  settingsSource: DispatchSettingsSource | null = null;
  alertSink: DispatchAlertSink | null = null;

  setSettingsSource(source: DispatchSettingsSource | null): void {
    this.settingsSource = source;
  }

  setAlertSink(sink: DispatchAlertSink | null): void {
    this.alertSink = sink;
  }
}

export const DISPATCH_SERVICE_OPTIONS = Symbol("DISPATCH_SERVICE_OPTIONS");

/** Seams for tests; production passes none. */
export interface DispatchServiceOptions {
  baseline?: DispatchSettings;
  resolver?: ProviderAccountResolver;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  settingsCacheMs?: number;
}

export interface ResolvedDispatchSettings {
  available: boolean;
  settings: DispatchSettings;
  limits: DerivedLimits;
  /** The stored overrides applied on top of the environment baseline. */
  overrides: Record<string, unknown>;
}

interface DispatchStore {
  permit?: DispatchPermit;
  scope?: DispatchRequest;
}

/** What a request on the egress path reports when it finishes. */
export interface EgressHandle {
  accepted(): void;
  failed(error: unknown): void;
}

interface AcquireOnce {
  granted: boolean;
  retryAfterMs: number;
  reason?: DeferralReason;
  reused: boolean;
  degraded: boolean;
  overage: boolean;
  wouldDefer: boolean;
}

/** A permit older than this when its request goes out is counted as stale. */
const STALE_PERMIT_MS = 2_000;
const BREAKER_FAILURES = 3;
const BREAKER_OPEN_MS = 5_000;
const ALERT_COOLDOWN_MS = 10 * 60_000;
const PAUSED_RETRY_MS = 5_000;

const sleepFor = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Every outbound call attempt Ringee controls asks this service for capacity
 * before it reaches the provider (CPS-001..CPS-007).
 *
 * Callers use it in one of two ways:
 *
 * - `admit()` — ask now, get a permit or a deferral, then run the provider call
 *   `runWithPermit(permit, …)`. For work that must decide BEFORE it creates
 *   rows or spends effort (an AI call that can wait in a queue).
 * - `runInScope()` — declare what the call is and let the provider request
 *   itself ask for capacity at the last moment (`TelnyxClient`). For legs a
 *   person is waiting on.
 *
 * Either way the Telnyx client checks every call-originating request
 * (`beginEgress`): even a previously admitted request takes a fresh shared
 * egress grant, so a delayed database write cannot bunch old permits together.
 *
 * The egress clocks are the account's one budget of call starts. A leg a client
 * dials itself (a browser after its pre-flight) never reaches the Telnyx
 * client, so its grant — `admit({ directStart: true })` — is taken from those
 * same clocks; the admission clocks only schedule server work ahead of its
 * egress. Neither kind of start can therefore spend capacity the other has
 * already used.
 *
 * Failure policy, deliberately not symmetrical:
 *
 * - Redis unreachable or slow, automated classes: DEFER. Never fail open — an
 *   outage must not become an unpaced flood of paid calls.
 * - Redis unreachable or slow, interactive: safely defer new outbound legs.
 *   Existing calls, inbound answers and hangups do not need a dispatch grant.
 *   A local counter cannot safely bound a provider account across replicas.
 */
@Injectable()
export class ProviderDispatchService {
  private readonly logger = new Logger("ProviderDispatch");
  private readonly store = new AsyncLocalStorage<DispatchStore>();
  private readonly limiter: RedisCpsLimiter | null;
  private readonly resolver: ProviderAccountResolver;
  private readonly baseline: DispatchSettings;
  private readonly nowMs: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly cacheMs: number;

  private cache: { at: number; value: ResolvedDispatchSettings } | null = null;
  private refreshing: Promise<ResolvedDispatchSettings> | null = null;
  private readonly alerted = new Map<string, number>();
  private readonly breaker = { failures: 0, openUntil: 0 };

  /** Counters for this process since it started, for the admin snapshot. */
  readonly counters: Record<string, number> = {};

  constructor(
    @Optional() @Inject(PROVIDER_DISPATCH_REDIS) redis?: RedisService | null,
    @Optional() private readonly runtime?: DispatchRuntime,
    @Optional()
    @Inject(DISPATCH_SERVICE_OPTIONS)
    options?: DispatchServiceOptions,
  ) {
    this.limiter = redis ? new RedisCpsLimiter(redis) : null;
    this.baseline = options?.baseline ?? configuredBaseline();
    this.resolver =
      options?.resolver ??
      new RingeeManagedAccountResolver(apiConfiguration.TELNYX_ACCOUNT_REF);
    this.nowMs = options?.nowMs ?? (() => Date.now());
    this.sleep = options?.sleep ?? sleepFor;
    this.random = options?.random ?? Math.random;
    this.cacheMs = options?.settingsCacheMs ?? 2_000;
  }

  // ── Settings ───────────────────────────────────────────────────────

  async getSettings(): Promise<ResolvedDispatchSettings> {
    const now = this.nowMs();
    if (this.cache && now - this.cache.at < this.cacheMs)
      return this.cache.value;
    this.refreshing ??= this.refreshSettings().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /**
   * Mark the cached settings stale so the next call reads the stored overrides
   * again. The value stays: if the store cannot be read then, the last known
   * overrides still apply, instead of silently reverting to the environment.
   */
  invalidateSettings(): void {
    if (this.cache) this.cache.at = Number.NEGATIVE_INFINITY;
  }

  private async refreshSettings(): Promise<ResolvedDispatchSettings> {
    let overrides: Record<string, unknown> = this.cache?.value.overrides ?? {};
    let available =
      !this.runtime?.settingsSource || this.cache?.value.available === true;
    try {
      if (this.runtime?.settingsSource) {
        overrides = await this.runtime.settingsSource();
        available = true;
      }
    } catch (error) {
      // Keep the last known overrides: a database blip must neither loosen
      // nor wipe a limit an administrator set.
      this.warnOnce(
        "settings-source",
        `Could not read the stored dispatch settings, keeping the last known ones: ${message(error)}`,
      );
    }
    const settings = applySettingsOverrides(this.baseline, overrides);
    const value = {
      settings,
      limits: deriveLimits(settings),
      overrides,
      available,
    };
    this.cache = { at: this.nowMs(), value };
    return value;
  }

  getAccount(): ProviderAccountRef {
    return this.resolver.resolve();
  }

  getDefaultSettings(): DispatchSettings {
    return { ...this.baseline };
  }

  async classFor(source: DispatchRequest["source"]): Promise<TrafficClass> {
    const { settings } = await this.getSettings();
    return resolveTrafficClass(source, settings.classOverrides);
  }

  // ── Admission ──────────────────────────────────────────────────────

  /**
   * Ask for the right to make one outbound attempt, waiting as long as the
   * request's class allows. Never throws for a busy clock: it returns a
   * deferral. Interactive traffic has reserved capacity and a bounded wait;
   * exhausting that wait never overrides the provider-account ceiling.
   */
  async admit(request: DispatchRequest): Promise<DispatchDecision> {
    // A start a client places itself spends the account's start budget now:
    // nothing of it will pass the egress gate later.
    if (request.directStart)
      return this.admitForPhase({ ...request, countAttempt: false }, "egress");
    return this.admitForPhase(request, "admission");
  }

  private async admitForPhase(
    request: DispatchRequest,
    phase: "admission" | "egress",
  ): Promise<DispatchDecision> {
    const resolved = await this.getSettings();
    const { settings } = resolved;
    const cls =
      request.cls ??
      resolveTrafficClass(request.source, settings.classOverrides);
    const level = TRAFFIC_LEVEL[cls];
    const workspaceKey =
      level >= 1 && request.workspace
        ? workspaceKeyOf(request.workspace)
        : null;
    const account = this.resolver.resolve({ workspaceKey });
    const context = {
      request,
      cls,
      level,
      workspaceKey,
      account,
      resolved,
      phase,
    };

    if (!resolved.available) {
      this.raise({
        key: "settings_unavailable",
        severity: "critical",
        title: "Stored dispatch policy is unavailable after startup",
        detail: {
          account: accountSlot(account),
          policy: "new outbound legs deferred until policy can be read",
        },
      });
      return {
        granted: false,
        reason: "coordination_unavailable",
        retryAfterMs: 1_000,
        waitedMs: 0,
      };
    }

    if (settings.mode === "off") {
      return {
        granted: true,
        waitedMs: 0,
        permit: this.permit(context, { counted: false, mode: "off" }),
      };
    }

    const started = this.nowMs();
    const deadline = Math.min(
      started + (request.maxWaitMs ?? waitBound(cls, settings)),
      request.expiresAtMs ?? Number.POSITIVE_INFINITY,
    );
    let attempt: AcquireOnce;
    for (;;) {
      if (
        request.expiresAtMs !== undefined &&
        this.nowMs() >= request.expiresAtMs
      ) {
        attempt = deferral("expired", 1_000);
        break;
      }
      attempt = await this.acquireOnce(context, "acquire");
      if (attempt.granted) break;
      const remaining = deadline - this.nowMs();
      const waitable =
        attempt.reason === "busy" || attempt.reason === "workspace_busy";
      if (!waitable || attempt.retryAfterMs > remaining) break;
      await this.sleep(attempt.retryAfterMs + Math.floor(this.random() * 15));
    }

    const waitedMs = Math.max(0, this.nowMs() - started);
    if (attempt.granted) {
      this.noteWait(account, level, waitedMs);
      if (attempt.overage) this.bump("overage");
      return {
        granted: true,
        waitedMs,
        permit: this.permit(context, {
          counted:
            phase === "egress" &&
            (request.countAttempt ?? true) &&
            !attempt.reused,
          overage: attempt.overage,
          degraded: attempt.degraded,
          mode: settings.mode,
        }),
      };
    }

    this.bump(`deferred_l${level}`);
    this.recordSoon(account, { [`deferred_l${level}`]: 1 });
    return {
      granted: false,
      reason: attempt.reason ?? "busy",
      retryAfterMs: Math.max(1, Math.ceil(attempt.retryAfterMs)),
      waitedMs,
    };
  }

  /**
   * Would a request of this kind be granted right now? Moves no clock, so it
   * can run every tick without spending capacity. In `observe` and `off` mode
   * nothing is ever deferred.
   *
   * A direct start is free when the start clocks are. A server start is
   * admitted on the admission clocks and then spends the start clocks at
   * egress, so it is free only when both are: work is not committed for a
   * start the account's budget cannot send.
   */
  async peek(
    request: DispatchRequest,
  ): Promise<{ free: boolean; retryAfterMs: number; reason?: DeferralReason }> {
    const resolved = await this.getSettings();
    const { settings } = resolved;
    if (!resolved.available)
      return {
        free: false,
        reason: "coordination_unavailable",
        retryAfterMs: 1_000,
      };
    if (settings.mode !== "enforce") return { free: true, retryAfterMs: 0 };
    const cls =
      request.cls ??
      resolveTrafficClass(request.source, settings.classOverrides);
    const level = TRAFFIC_LEVEL[cls];
    const workspaceKey =
      level >= 1 && request.workspace
        ? workspaceKeyOf(request.workspace)
        : null;
    const account = this.resolver.resolve({ workspaceKey });
    const phases: Array<"admission" | "egress"> = request.directStart
      ? ["egress"]
      : ["admission", "egress"];
    let blocked: AcquireOnce | null = null;
    for (const phase of phases) {
      const attempt = await this.acquireOnce(
        { request, cls, level, workspaceKey, account, resolved, phase },
        "peek",
      );
      if (
        !attempt.granted &&
        (!blocked || attempt.retryAfterMs > blocked.retryAfterMs)
      )
        blocked = attempt;
    }
    return blocked
      ? {
          free: false,
          retryAfterMs: Math.max(1, Math.ceil(blocked.retryAfterMs)),
          reason: blocked.reason,
        }
      : { free: true, retryAfterMs: 0 };
  }

  private permit(
    context: {
      request: DispatchRequest;
      cls: TrafficClass;
      level: TrafficLevel;
      workspaceKey: string | null;
      account: ProviderAccountRef;
    },
    state: {
      counted: boolean;
      mode: DispatchPermit["mode"];
      overage?: boolean;
      degraded?: boolean;
    },
  ): DispatchPermit {
    return {
      id: randomUUID(),
      account: context.account,
      cls: context.cls,
      level: context.level,
      source: context.request.source,
      workspaceKey: context.workspaceKey,
      request: context.request,
      grantedAtMs: this.nowMs(),
      counted: state.counted,
      overage: state.overage ?? false,
      degraded: state.degraded ?? false,
      mode: state.mode,
      consumed: false,
    };
  }

  private async acquireOnce(
    context: {
      request: DispatchRequest;
      cls: TrafficClass;
      level: TrafficLevel;
      workspaceKey: string | null;
      account: ProviderAccountRef;
      resolved: ResolvedDispatchSettings;
      phase?: "admission" | "egress";
    },
    mode: "acquire" | "peek" | "force",
  ): Promise<AcquireOnce> {
    const { settings, limits } = context.resolved;
    const { level, account } = context;

    if (
      settings.mode === "enforce" &&
      settings.pausedClasses.includes(context.cls)
    ) {
      return deferral("paused", PAUSED_RETRY_MS);
    }

    if (this.limiter && !this.breakerOpen()) {
      const input: AcquireInput = {
        account,
        phase: context.phase,
        level,
        // `observe` mode counts what enforcement would have deferred and
        // never delays anyone.
        mode: settings.mode === "observe" && mode !== "peek" ? "observe" : mode,
        levelIntervalsMicros: limits.levelIntervalsMicros,
        workspaceKey: context.workspaceKey,
        workspaceIntervalMicros:
          context.workspaceKey &&
          settings.orgAutomationOverrides[context.workspaceKey]
            ? Math.ceil(
                1_000_000 /
                  settings.orgAutomationOverrides[context.workspaceKey],
              )
            : limits.orgIntervalMicros,
        automationGuardMicros: limits.automationGuardMicros,
        overageHorizonMicros: limits.overageHorizonMicros,
        // Durable operation idempotency prevents a second dial. Every actual
        // HTTP attempt must still take a fresh grant, even for the same command.
        idempotencyRef:
          context.phase === "egress"
            ? null
            : (context.request.idempotencyRef ?? null),
        countAttempt:
          context.phase === "egress" && (context.request.countAttempt ?? true),
      };
      try {
        const result = await withTimeout(
          this.limiter.acquire(input),
          settings.coordinationTimeoutMs,
        );
        this.breakerSuccess();
        if (result.reused) this.bump("permit_reuse");
        if (!result.granted) {
          return deferral(
            result.blockedBy === "workspace" ? "workspace_busy" : "busy",
            result.retryAfterMicros / 1000,
          );
        }
        return {
          granted: true,
          retryAfterMs: 0,
          reused: result.reused,
          degraded: false,
          overage: result.overage,
          wouldDefer: result.wouldDefer,
        };
      } catch (error) {
        this.breakerFailure(error);
      }
    }
    return this.acquireDegraded(context);
  }

  /** Redis could not decide in time. See the class comment for the policy. */
  private acquireDegraded(context: {
    request: DispatchRequest;
    cls: TrafficClass;
    level: TrafficLevel;
    workspaceKey: string | null;
    account: ProviderAccountRef;
    resolved: ResolvedDispatchSettings;
  }): AcquireOnce {
    const { settings } = context.resolved;
    this.bump("degraded");
    this.raise({
      key: "coordination_unavailable",
      severity: "critical",
      title: "Outbound pacing cannot reach Redis",
      detail: {
        policy: "new outbound legs are deferred for every traffic class",
        account: accountSlot(context.account),
      },
    });

    // `observe` never blocks anything, and `off` never gets here.
    if (settings.mode === "observe") {
      return grant({ degraded: true });
    }
    return deferral(
      "coordination_unavailable",
      Math.max(1_000, this.breaker.openUntil - this.nowMs()),
    );
  }

  // ── Permits through async code ─────────────────────────────────────

  /** Runs `fn` so the provider request inside it spends this permit. */
  runWithPermit<T>(permit: DispatchPermit, fn: () => Promise<T>): Promise<T> {
    return this.store.run({ permit, scope: permit.request }, fn);
  }

  /**
   * Runs `fn` declaring what the calls inside it are; the provider request
   * asks for capacity itself, at the last moment, with this class and workspace.
   */
  runInScope<T>(request: DispatchRequest, fn: () => Promise<T>): Promise<T> {
    return this.store.run({ scope: request }, fn);
  }

  // ── The provider egress ────────────────────────────────────────────

  /**
   * Called by the Telnyx client before a request leaves. `null` for anything
   * that does not start a call. Otherwise the request has been paced, and the
   * handle reports its outcome.
   *
   * Throws `ProviderDispatchDeferredError` — before anything is sent — when an
   * automated request finds no capacity.
   */
  async beginEgress(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<EgressHandle | null> {
    if (!isCallOriginatingRequest(method, path, body)) return null;
    const { settings } = await this.getSettings();
    if (settings.mode === "off") return null;

    const store = this.store.getStore();
    const permit = store?.permit;
    const alreadyConsumed = permit?.consumed;
    if (permit && !permit.consumed) {
      permit.consumed = true;
      if (this.nowMs() - permit.grantedAtMs > STALE_PERMIT_MS) {
        this.bump("stale_permit");
        this.recordSoon(permit.account, { stale_permit: 1 });
      }
    }

    let request: DispatchRequest;
    if (store?.scope) {
      request = store.scope;
      if (permit && alreadyConsumed) {
        this.bump("permit_reuse");
        this.recordSoon(permit.account, { permit_reuse: 1 });
      }
    } else {
      request = { source: "unscoped" };
      this.bump("bypass");
      this.recordSoon(this.resolver.resolve(), { bypass: 1 });
      this.raise({
        key: `bypass:${path.split(/[?#]/, 1)[0].replace(/[0-9a-f-]{8,}/gi, ":id")}`,
        severity: "warning",
        title: "An outbound call started without declaring its traffic class",
        detail: {
          method,
          path: path.split(/[?#]/, 1)[0].replace(/[0-9a-f-]{8,}/gi, ":id"),
        },
      });
    }

    // Admission permits are scheduling hints, never a right to bypass egress.
    // No database or provider preparation runs after this shared gate. A bounded
    // wait also absorbs recovery warm-up and permits delayed by local writes.
    const decision = await this.admitForPhase(
      {
        ...request,
        idempotencyRef: undefined,
        directStart: undefined,
        countAttempt: true,
        maxWaitMs: Math.max(
          permit ? 2_000 : 0,
          request.maxWaitMs ??
            waitBound(
              request.cls ??
                resolveTrafficClass(request.source, settings.classOverrides),
              settings,
            ),
        ),
      },
      "egress",
    );
    if (!decision.granted) {
      throw new ProviderDispatchDeferredError(
        decision.reason,
        decision.retryAfterMs,
      );
    }
    decision.permit.consumed = true;
    return this.handle(decision.permit.account);
  }

  private handle(account: ProviderAccountRef): EgressHandle {
    return {
      accepted: () => this.recordSoon(account, { accepted: 1 }),
      failed: (error) => this.recordSoon(account, classifyFailure(error)),
    };
  }

  /**
   * A leg Ringee did not place but now sees, through its webhook: a browser
   * that dialed Telnyx directly after a pre-flight. Counted once per call, in
   * the second the webhook arrived.
   */
  async observeExternalAttempt(input: {
    source: DispatchRequest["source"];
    callControlId: string;
  }): Promise<void> {
    try {
      const { settings } = await this.getSettings();
      if (settings.mode === "off" || !this.limiter) return;
      await withTimeout(
        this.limiter.record(
          this.resolver.resolve(),
          {
            observed: 1,
            [`observed_l${TRAFFIC_LEVEL[await this.classFor(input.source)]}`]: 1,
          },
          { countAttempt: true, dedupeRef: `obs:${input.callControlId}` },
        ),
        settings.coordinationTimeoutMs,
      );
    } catch (error) {
      this.logger.debug(`Could not count an observed leg: ${message(error)}`);
    }
  }

  // ── Bookkeeping ────────────────────────────────────────────────────

  private noteWait(
    account: ProviderAccountRef,
    level: number,
    waitedMs: number,
  ) {
    if (waitedMs < 100) return;
    const bucket = waitedMs >= 1000 ? "1000" : waitedMs >= 500 ? "500" : "100";
    this.recordSoon(account, { [`w_l${level}_${bucket}`]: 1 });
  }

  /** Statistics are never worth a call's latency: written in the background. */
  private recordSoon(
    account: ProviderAccountRef,
    events: Record<string, number>,
  ): void {
    if (!this.limiter || this.breakerOpen()) return;
    void this.limiter.record(account, events).catch((error) => {
      this.logger.debug(
        `Could not record dispatch statistics: ${message(error)}`,
      );
    });
  }

  private bump(counter: string): void {
    this.counters[counter] = (this.counters[counter] ?? 0) + 1;
  }

  private breakerOpen(): boolean {
    return this.nowMs() < this.breaker.openUntil;
  }

  private breakerSuccess(): void {
    if (this.breaker.failures > 0 || this.breaker.openUntil > 0) {
      if (this.breaker.openUntil > 0)
        this.logger.log("Outbound pacing reached Redis again.");
      this.breaker.failures = 0;
      this.breaker.openUntil = 0;
    }
  }

  private breakerFailure(error: unknown): void {
    this.breaker.failures += 1;
    this.warnOnce(
      "redis",
      `Outbound pacing could not reach Redis (${this.breaker.failures}): ${message(error)}`,
    );
    if (this.breaker.failures >= BREAKER_FAILURES) {
      this.breaker.openUntil = this.nowMs() + BREAKER_OPEN_MS;
    }
  }

  /** Reports a condition someone has to act on, at most once per cooldown. */
  raise(alert: DispatchAlert): void {
    const now = this.nowMs();
    const last = this.alerted.get(alert.key);
    if (last !== undefined && now - last < ALERT_COOLDOWN_MS) return;
    this.alerted.set(alert.key, now);
    this.logger.error(
      `[cps-alert] ${alert.severity} ${alert.key}: ${alert.title} ${JSON.stringify(alert.detail)}`,
    );
    try {
      const pending = this.runtime?.alertSink?.(alert);
      if (pending) void Promise.resolve(pending).catch(() => undefined);
    } catch {
      // An alert that cannot be delivered must not break the call it is about.
    }
  }

  private warnOnce(key: string, text: string): void {
    const now = this.nowMs();
    const last = this.alerted.get(`warn:${key}`);
    if (last !== undefined && now - last < 60_000) return;
    this.alerted.set(`warn:${key}`, now);
    this.logger.warn(text);
  }

  /**
   * One UTC hour's counters as the limiter wrote them (any instant inside the
   * hour selects it). Throws when Redis cannot be reached: the caller decides
   * whether a missing reading is an error or just a gap.
   */
  async readHour(instantMs: number): Promise<Record<string, number>> {
    if (!this.limiter) return {};
    return this.limiter.readHour(this.resolver.resolve(), instantMs);
  }

  /** Attempts counted in each of the last `seconds` seconds, oldest first. */
  async recentSeconds(
    seconds: number,
  ): Promise<{ endSecond: number; counts: number[] }> {
    if (!this.limiter)
      return { endSecond: Math.floor(this.nowMs() / 1000), counts: [] };
    return this.limiter.recentSeconds(this.resolver.resolve(), seconds);
  }

  /** For the admin snapshot. */
  async state() {
    const resolved = await this.getSettings();
    return {
      account: this.resolver.resolve(),
      settings: resolved.settings,
      overrides: resolved.overrides,
      limits: resolved.limits,
      breaker: {
        open: this.breakerOpen(),
        failures: this.breaker.failures,
      },
      counters: { ...this.counters },
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Runs `fn` declaring what the provider requests inside it are, where pacing is
 * wired; plainly otherwise, so a service that is built without it (a script, a
 * test) behaves as it always did. The one line every call site needs.
 */
export function inDispatchScope<T>(
  dispatch: ProviderDispatchService | undefined,
  scope: DispatchRequest,
  fn: () => Promise<T>,
): Promise<T> {
  return dispatch ? dispatch.runInScope(scope, fn) : fn();
}

function configuredBaseline(): DispatchSettings {
  return baselineSettings({
    mode: apiConfiguration.TELNYX_CPS_MODE,
    ceilingCps: apiConfiguration.TELNYX_CPS_CEILING,
    safetyMargin: apiConfiguration.TELNYX_CPS_SAFETY_MARGIN,
    orgAutomationCps: apiConfiguration.DISPATCH_ORG_AUTOMATION_CPS,
    queueEnabled: apiConfiguration.DISPATCH_QUEUE_ENABLED,
    orgConcurrency: apiConfiguration.DISPATCH_ORG_CONCURRENCY,
    queueMaxPerWorkspace: apiConfiguration.DISPATCH_QUEUE_MAX_PER_WORKSPACE,
    queueMaxTotal: apiConfiguration.DISPATCH_QUEUE_MAX_TOTAL,
    queueMaxWaitMinutes: apiConfiguration.DISPATCH_QUEUE_MAX_WAIT_MINUTES,
    surchargeBudgetUsd: apiConfiguration.TELNYX_CPS_SURCHARGE_BUDGET_USD,
  });
}

function waitBound(cls: TrafficClass, settings: DispatchSettings): number {
  switch (cls) {
    case "interactive":
      return settings.interactiveMaxWaitMs;
    case "scheduled":
      return settings.scheduledMaxWaitMs;
    case "automation":
      return settings.automationMaxWaitMs;
    default:
      return settings.backgroundMaxWaitMs;
  }
}

function grant(extra: Partial<AcquireOnce> = {}): AcquireOnce {
  return {
    granted: true,
    retryAfterMs: 0,
    reused: false,
    degraded: false,
    overage: false,
    wouldDefer: false,
    ...extra,
  };
}

function deferral(
  reason: DeferralReason,
  retryAfterMs: number,
  extra: Partial<AcquireOnce> = {},
): AcquireOnce {
  return {
    granted: false,
    retryAfterMs,
    reason,
    reused: false,
    degraded: false,
    overage: false,
    wouldDefer: false,
    ...extra,
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Redis did not answer within ${ms} ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** What a failed provider request counts as. */
export function classifyFailure(error: unknown): Record<string, number> {
  const status = statusOf(error);
  if (status === 429) {
    const code = codeOf(error);
    return code === "90103"
      ? { rate_limited: 1, dps_rejected: 1 }
      : { rate_limited: 1 };
  }
  // A 4xx is an answer: the provider refused and no call exists. Anything else
  // (a 5xx, a timeout, a dropped connection) may have placed one, so it is
  // kept as an attempt and never retried blindly.
  if (status !== null && status >= 400 && status < 500) return { rejected: 1 };
  return { ambiguous: 1 };
}

function statusOf(error: unknown): number | null {
  const candidate = error as {
    response?: { status?: number };
    status?: number;
    getStatus?: () => number;
  } | null;
  const status =
    candidate?.response?.status ??
    (typeof candidate?.getStatus === "function"
      ? candidate.getStatus()
      : undefined) ??
    candidate?.status;
  return typeof status === "number" ? status : null;
}

function codeOf(error: unknown): string | null {
  const body =
    (error as { response?: { data?: unknown } } | null)?.response?.data ??
    (typeof (error as { getResponse?: () => unknown })?.getResponse ===
    "function"
      ? (error as { getResponse: () => unknown }).getResponse()
      : null);
  const first = (body as { errors?: Array<{ code?: unknown }> } | null)
    ?.errors?.[0];
  return first?.code !== undefined ? String(first.code) : null;
}
