import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { apiConfiguration } from "@ringee/configuration";
import {
  FollowUpActivationRepository,
  ProductAnalyticsRepository,
  isAnsweredCall,
  type Call,
  type NewProductAnalyticsEvent,
  type ProductAnalyticsCursorPosition,
} from "@ringee/database";
import {
  ANALYTICS_WORKSPACE_GROUP,
  BACKEND_ANALYTICS_FACTS,
  CHECKOUT_ENTRY_POINTS,
  PRODUCT_ANALYTICS_PROVIDER,
  PRODUCT_ANALYTICS_SCHEMA_VERSION,
  durationBucket,
  normalizeErrorCode,
  sanitizeFactProperties,
  sanitizePropertyValue,
  sizeBucket,
  technicalDistinctId,
  toSanitizedErrorObject,
  workspaceKeyOf,
  workspaceTypeOf,
  type AnalyticsActorType,
  type AnalyticsPropertyValue,
  type BackendAnalyticsFact,
  type OwnershipContext,
  type ProductAnalyticsProvider,
} from "@ringee/platform";
import { FOLLOW_UP_ONBOARDING_VERSION } from "../voice-agents/automations/follow-up-activation";
import { AI_VOICE_AGENT_CALL_SOURCE } from "../voice-agents/voice-agent.types";
import { registerJourneyExceptionSink } from "./journey-exceptions";

/** The outcome of one live inventory lookup, as the dashboard shows it. */
export type NumberLookupStatus = "results" | "empty" | "failed";

/** One fact a producer hands over after its business write committed. */
export interface ProductAnalyticsFact {
  event: BackendAnalyticsFact;
  /** Stable identity of the evidence — the same fact always has the same key. */
  key: string;
  occurredAt: Date;
  /** The workspace the fact belongs to; null for a fact without one. */
  workspace: OwnershipContext | null;
  /** The human who acted, when the actor is human. */
  humanUserId?: string | null;
  /** Overrides the fact's default actor (e.g. an auto-reload is `system`). */
  actor?: AnalyticsActorType;
  properties?: Record<string, unknown>;
}

/** Where an exception happened, in bounded vocabulary (Stage 4B §10). */
export interface ExceptionCaptureContext {
  /** The owning component, e.g. `VoiceAgentAutomationService`. */
  component: string;
  /** The operation, e.g. `follow_up.adopt`, `numbers.lookup`. */
  operation: string;
  /** The journey step affected, e.g. `follow_up_activation`. */
  journeyStep: string;
  severity?: "warning" | "error" | "critical";
  workspace?: OwnershipContext | null;
  userId?: string | null;
  /** Opaque, authorized correlation ids (call, meeting, objective). */
  correlation?: Record<string, string | null | undefined>;
}

const DRAIN_BATCH = 100;
const DRAIN_MAX_BATCHES = 10;
const DRAIN_LEASE_MS = 2 * 60_000;
const MAX_ATTEMPTS = 8;
const PROJECTION_BATCH = 200;
/** Evidence younger than this may still be committing elsewhere. */
const PROJECTION_LAG_MS = 30_000;
/**
 * How late a row may commit and still be recorded: a second, trailing pass
 * reads every row again once it is this old.
 */
const LOOKBACK_MS = 15 * 60_000;
const RETENTION_MS = 30 * 24 * 60 * 60_000;

type ProjectionSource =
  | "signups"
  | "organizations"
  | "credit_topups"
  | "credit_grants"
  | "meeting_actions"
  | "reminders_planned"
  | "objective_events"
  | "followup_adoptions"
  | "lines_acquired";

const PROJECTION_SOURCES: ProjectionSource[] = [
  "signups",
  "organizations",
  "credit_topups",
  "credit_grants",
  "meeting_actions",
  "reminders_planned",
  "objective_events",
  "followup_adoptions",
  "lines_acquired",
];

/** Definitive AI meeting actions that are value, by AGENT-020 kind. */
const VALUE_RESULTS = new Set([
  "booked",
  "attendance_confirmed",
  "rescheduled",
  "replaced",
]);
/** Definitive decisions that close work without being a success. */
const RESOLUTION_RESULTS = new Set([
  "cancelled",
  "declined_without_rescheduling",
]);

/**
 * Product analytics and scoped error tracking (Stage 4B), behind the
 * provider seam of `@ringee/platform`.
 *
 * Facts reach the provider only through the `ProductAnalyticsEvent` outbox:
 * producers record them after their business transaction committed (never
 * inside it), and cursor projectors derive the money and value facts from
 * durable evidence — the credit ledger, the AI meeting actions, the objective
 * history — so a missed recording is recovered from the evidence itself. The
 * orchestrator drain ships them with the original time and a UUID derived from
 * the evidence key, which the provider deduplicates on.
 *
 * Nothing here can fail, slow or retry a call, booking, activation or charge:
 * every public method swallows its own failures, and with no project
 * configured nothing is stored or sent.
 */
@Injectable()
export class ProductAnalyticsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProductAnalyticsService.name);

  constructor(
    private readonly repo: ProductAnalyticsRepository,
    private readonly activations: FollowUpActivationRepository,
    @Inject(PRODUCT_ANALYTICS_PROVIDER)
    private readonly provider: ProductAnalyticsProvider,
  ) {}

  get enabled(): boolean {
    return this.provider.enabled;
  }

  onModuleInit(): void {
    // Services capture journey exceptions through this one instance.
    registerJourneyExceptionSink((error, context) =>
      this.captureException(error, context),
    );
  }

  async onModuleDestroy(): Promise<void> {
    registerJourneyExceptionSink(null);
    await this.provider.shutdown();
  }

  // ── Recording ──────────────────────────────────────────────────────

  /**
   * Records facts after the write they describe committed. Idempotent by
   * `key`; never throws — analytics cannot fail the operation it describes.
   */
  async record(...facts: ProductAnalyticsFact[]): Promise<void> {
    if (!this.provider.enabled || !facts.length) return;
    try {
      await this.repo.recordMany(facts.map((fact) => this.toRow(fact)));
    } catch (error) {
      this.logger.warn(
        `Analytics facts not recorded (${facts.map((f) => f.event).join(",")}): ${normalizeErrorCode(error)}`,
      );
    }
  }

  /** The stored shape of a fact: envelope, allowlisted properties, groups. */
  toRow(fact: ProductAnalyticsFact): NewProductAnalyticsEvent {
    const definition = BACKEND_ANALYTICS_FACTS[fact.event];
    const actor: AnalyticsActorType = fact.actor ?? definition.actor;
    const workspaceKey = fact.workspace ? workspaceKeyOf(fact.workspace) : null;
    const eventKey = `${fact.event}:${fact.key}`;
    const id = analyticsEventUuid(eventKey);
    const distinctId =
      actor === "human" && fact.humanUserId
        ? fact.humanUserId
        : workspaceKey
          ? technicalDistinctId(
              actor === "human" ? "system" : actor,
              workspaceKey,
            )
          : technicalDistinctId("system", "global");
    const envelope: Record<string, unknown> = {
      schema_version: PRODUCT_ANALYTICS_SCHEMA_VERSION,
      event_id: id,
      occurred_at: fact.occurredAt.toISOString(),
      // A human fact without a known human is reported as the system's.
      actor_type: actor === "human" && !fact.humanUserId ? "system" : actor,
      environment: apiConfiguration.RINGEE_ENVIRONMENT,
      release_version: apiConfiguration.RINGEE_RELEASE,
      ...(fact.workspace
        ? {
            workspace_key: workspaceKey,
            workspace_type: workspaceTypeOf(fact.workspace),
            ...(fact.workspace.organizationId
              ? { organization_id: fact.workspace.organizationId }
              : {}),
          }
        : {}),
    };
    const properties = {
      ...sanitizeFactProperties(fact.event, {
        ...(fact.properties ?? {}),
        ...envelope,
      }),
      ...(workspaceKey
        ? { $groups: { [ANALYTICS_WORKSPACE_GROUP]: workspaceKey } }
        : {}),
    };
    return {
      id,
      eventKey,
      event: fact.event,
      distinctId,
      occurredAt: fact.occurredAt,
      properties,
      workspaceKey,
    };
  }

  /**
   * Who the dashboard reports as: the internal user id (the backend facts'
   * distinct id) and the effective workspace group. Correlation only.
   */
  identity(ctx: OwnershipContext): {
    distinctId: string;
    workspace: { key: string; type: "personal" | "organization" };
  } {
    return {
      distinctId: ctx.userId,
      workspace: { key: workspaceKeyOf(ctx), type: workspaceTypeOf(ctx) },
    };
  }

  // ── Producers ──────────────────────────────────────────────────────
  //
  // Each helper turns one committed business write into its fact. They are
  // called fire-and-forget (`void`) after the write, swallow their own
  // failures and do nothing while analytics is off.

  /**
   * A human call that ended connected (CALL-012): `human_call_connected`, once
   * per call, with whether it is the workspace's first. An AI agent's leg is
   * never human activity. A greeting that stamped the pickup and is recorded
   * as voicemail only later still counts here; the outcome fact carries the
   * corrected `conversation`.
   */
  async callEnded(call: Call): Promise<void> {
    if (!this.provider.enabled) return;
    try {
      if (call.source === AI_VOICE_AGENT_CALL_SOURCE) return;
      if (!call.answeredAt || !isAnsweredCall(call)) return;
      const workspace = workspaceOfCall(call);
      if (!workspace) return;
      const earlier = await this.repo.hadEarlierConnectedHumanCall({
        id: call.id,
        userId: call.userId,
        organizationId: call.organizationId,
        answeredAt: call.answeredAt,
      });
      await this.record({
        event: "human_call_connected",
        key: call.id,
        occurredAt: call.answeredAt,
        workspace,
        humanUserId: call.userId,
        properties: {
          direction: callDirection(call.direction),
          call_surface: call.source ?? "web",
          is_first_for_workspace: !earlier,
          duration_bucket: durationBucket(call.durationSeconds),
          caller_id_kind: callerIdKind(call),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Connected-call fact not recorded: ${normalizeErrorCode(error)}`,
      );
    }
  }

  /**
   * A human outcome accepted for a call (manual or campaign — the one
   * acceptance boundary). Keyed by the call's outcome revision, so saving the
   * same outcome again is the same fact.
   */
  async outcomeRecorded(
    ctx: OwnershipContext,
    call: Call,
    followUpState: string | null,
  ): Promise<void> {
    if (!this.provider.enabled || !call.outcome) return;
    await this.record({
      event: "call_outcome_recorded",
      key: `${call.id}:r${call.outcomeRevision}`,
      occurredAt: new Date(),
      workspace: ctx,
      humanUserId: ctx.userId,
      properties: {
        outcome: call.outcome,
        conversation: isAnsweredCall(call),
        call_surface: call.source ?? "web",
        follow_up_state: followUpState ?? "none",
      },
    });
  }

  /** The first-list onboarding finished in this workspace (BILL-022). */
  async firstListCompleted(
    ctx: OwnershipContext,
    input: {
      contactCount: number;
      rewardOffered: boolean;
      rewardGranted: number;
    },
  ): Promise<void> {
    await this.record({
      event: "first_list_completed",
      // Once per person and workspace, like the onboarding step it mirrors.
      key: `${ctx.userId}:${workspaceKeyOf(ctx)}`,
      occurredAt: new Date(),
      workspace: ctx,
      humanUserId: ctx.userId,
      properties: {
        reward_offered: input.rewardOffered,
        reward_granted_usd: input.rewardGranted,
        list_size_bucket: sizeBucket(input.contactCount),
      },
    });
  }

  /**
   * A credit checkout the payment provider accepted, tied to the workspace it
   * will credit. Payment success is never inferred from here: the confirmed
   * top-up is projected from the ledger (`credit_topup_confirmed`).
   */
  async checkoutStarted(
    ctx: OwnershipContext,
    input: {
      /** The provider's session or payment-intent id, when it returned one. */
      reference: string | null;
      amountUsd: number;
      kind: "hosted_checkout" | "payment_intent" | "saved_card";
      entryPoint?: string | null;
    },
  ): Promise<void> {
    const entryPoint = (CHECKOUT_ENTRY_POINTS as readonly string[]).includes(
      input.entryPoint ?? "",
    )
      ? input.entryPoint
      : "other";
    await this.record({
      event: "credit_checkout_started",
      key: input.reference ?? randomUUID(),
      occurredAt: new Date(),
      workspace: ctx,
      humanUserId: ctx.userId,
      properties: {
        amount_usd: input.amountUsd,
        checkout_kind: input.kind,
        entry_point: entryPoint,
      },
    });
  }

  /** One live number-inventory lookup and what it found. */
  async numberLookupCompleted(
    ctx: OwnershipContext | null,
    input: {
      status: NumberLookupStatus;
      countryCode: string;
      numberType: string | null;
      filtersUsed: boolean;
      results: number;
      errorCode: string | null;
    },
  ): Promise<void> {
    await this.record({
      event: "number_lookup_completed",
      key: randomUUID(),
      occurredAt: new Date(),
      workspace: ctx,
      humanUserId: ctx?.userId ?? null,
      properties: {
        lookup_status: input.status,
        country_code: input.countryCode.toUpperCase().slice(0, 2),
        number_type: input.numberType ?? "any",
        filters_used: input.filtersUsed,
        results_bucket: sizeBucket(input.results),
        error_code: input.errorCode,
      },
    });
  }

  // ── Projection from durable evidence ───────────────────────────────

  /**
   * Turns new evidence into facts, one bounded page per source and tick, plus
   * a trailing page for rows committed after the cursor passed them.
   * Safe to run twice: keys make every second recording a no-op.
   */
  async project(now = new Date()): Promise<number> {
    if (!this.provider.enabled) return 0;
    const upTo = new Date(now.getTime() - PROJECTION_LAG_MS);
    let recorded = 0;
    for (const source of PROJECTION_SOURCES) {
      try {
        recorded += await this.projectSource(source, upTo);
      } catch (error) {
        this.logger.warn(
          `Analytics projection ${source} failed: ${normalizeErrorCode(error)}`,
        );
      }
    }
    return recorded;
  }

  private async projectSource(
    source: ProjectionSource,
    upTo: Date,
  ): Promise<number> {
    const stored = await this.repo.getCursor(source);
    // First run: start from now rather than replaying history the provider
    // never had. Backfills are an explicit, separate decision.
    const cursor: ProductAnalyticsCursorPosition = stored ?? {
      at: upTo,
      id: null,
    };
    const lateKey = `${source}:late`;
    if (!stored) {
      await this.repo.saveCursor(source, cursor);
      // The late pass starts where the projection starts.
      await this.repo.saveCursor(lateKey, cursor);
      return 0;
    }
    const page = await this.readSource(source, cursor, upTo);
    let recorded = 0;
    if (page.facts.length) {
      recorded += await this.repo.recordMany(
        page.facts.map((fact) => this.toRow(fact)),
      );
    }
    if (page.last) await this.repo.saveCursor(source, page.last);

    // Late commits: a second cursor trails the first by LOOKBACK_MS and reads
    // every row again, one page per tick, resuming where it stopped — so a row
    // that committed up to that late behind the main cursor is recorded,
    // however many rows its window holds.
    let late = await this.repo.getCursor(lateKey);
    if (!late) {
      late = stored;
      await this.repo.saveCursor(lateKey, late);
    }
    const latePage = await this.readSource(
      source,
      late,
      new Date(upTo.getTime() - LOOKBACK_MS),
    );
    if (latePage.facts.length) {
      recorded += await this.repo.recordMany(
        latePage.facts.map((fact) => this.toRow(fact)),
      );
    }
    if (latePage.last) await this.repo.saveCursor(lateKey, latePage.last);
    return recorded;
  }

  private async readSource(
    source: ProjectionSource,
    cursor: ProductAnalyticsCursorPosition,
    upTo: Date,
  ): Promise<{
    facts: ProductAnalyticsFact[];
    last: ProductAnalyticsCursorPosition | null;
  }> {
    const take = PROJECTION_BATCH;
    switch (source) {
      case "signups": {
        const rows = await this.repo.usersAfter(cursor, upTo, take);
        return {
          facts: rows.map((row) => ({
            event: "signup_completed" as const,
            key: row.id,
            occurredAt: row.createdAt,
            workspace: { userId: row.id, organizationId: null },
            humanUserId: row.id,
          })),
          last: lastOf(rows, (row) => row.createdAt),
        };
      }
      case "organizations": {
        const rows = await this.repo.organizationsAfter(cursor, upTo, take);
        return {
          facts: rows
            .filter((row) => row.creatorUserId)
            .map((row) => ({
              event: "workspace_created" as const,
              key: row.id,
              occurredAt: row.createdAt,
              workspace: {
                userId: row.creatorUserId!,
                organizationId: row.id,
              },
              humanUserId: row.creatorUserId,
              properties: { origin: "organization_created" },
            })),
          last: lastOf(rows, (row) => row.createdAt),
        };
      }
      case "credit_topups": {
        const rows = await this.repo.topupsAfter(cursor, upTo, take);
        return {
          facts: rows.flatMap((row) => {
            const workspace = workspaceOfLedger(row);
            if (!workspace) return [];
            const automatic = row.source === "auto_reload";
            return [
              {
                event: "credit_topup_confirmed" as const,
                key: row.id,
                occurredAt: row.createdAt,
                workspace,
                actor: automatic ? ("system" as const) : ("human" as const),
                humanUserId: automatic ? null : row.userId,
                properties: {
                  amount_usd: row.amount,
                  payment_source: row.source ?? "unknown",
                  is_first_paid_topup: row.earlierPaidTopups === 0,
                },
              },
            ];
          }),
          last: lastOf(rows, (row) => row.createdAt),
        };
      }
      case "credit_grants": {
        const rows = await this.repo.grantsAfter(cursor, upTo, take);
        return {
          facts: rows.flatMap((row) => {
            const workspace = workspaceOfLedger(row);
            if (!workspace) return [];
            return [
              {
                event: "credit_grant_recorded" as const,
                key: row.id,
                occurredAt: row.createdAt,
                workspace,
                properties: {
                  amount_usd: row.amount,
                  grant_source: (row.source ?? "unknown").toLowerCase(),
                },
              },
            ];
          }),
          last: lastOf(rows, (row) => row.createdAt),
        };
      }
      case "meeting_actions": {
        const rows = await this.repo.meetingActionsAfter(cursor, upTo, take);
        const adoptions = await this.adoptionsByWorkspace(
          rows.map((row) =>
            workspaceKeyOf({
              userId: row.userId!,
              organizationId: row.organizationId,
            }),
          ),
        );
        return {
          facts: rows.flatMap((row) => {
            const value = VALUE_RESULTS.has(row.kind);
            if (!value && !RESOLUTION_RESULTS.has(row.kind)) return [];
            const workspace = {
              userId: row.userId!,
              organizationId: row.organizationId,
            };
            const adoptedAt = adoptions.get(workspaceKeyOf(workspace));
            return [
              {
                event: "followup_business_result_recorded" as const,
                // One fact per stored action: an action that also resolves an
                // objective is still one business result.
                key: row.id,
                occurredAt: row.createdAt,
                workspace,
                properties: {
                  result_kind: row.kind,
                  counts_as_value: value,
                  via_objective: Boolean(row.followUpId),
                  via_handoff: Boolean(row.handoffId),
                  after_adoption: Boolean(
                    adoptedAt && row.createdAt >= adoptedAt,
                  ),
                  onboarding_version: adoptedAt
                    ? FOLLOW_UP_ONBOARDING_VERSION
                    : null,
                },
              },
            ];
          }),
          last: lastOf(rows, (row) => row.createdAt),
        };
      }
      case "reminders_planned": {
        const rows = await this.repo.remindersPlannedAfter(cursor, upTo, take);
        const adoptions = await this.adoptionsByWorkspace(
          rows.map((row) =>
            workspaceKeyOf({
              userId: row.userId!,
              organizationId: row.organizationId,
            }),
          ),
        );
        return {
          facts: rows.map((row) => {
            const workspace = {
              userId: row.userId!,
              organizationId: row.organizationId,
            };
            const adoptedAt = adoptions.get(workspaceKeyOf(workspace));
            return {
              event: "followup_reminder_planned" as const,
              key: row.id,
              occurredAt: row.createdAt,
              workspace,
              properties: {
                reminder_trigger: row.trigger,
                offset_minutes: row.offsetMinutes,
                after_adoption: Boolean(
                  adoptedAt && row.createdAt >= adoptedAt,
                ),
              },
            };
          }),
          last: lastOf(rows, (row) => row.createdAt),
        };
      }
      case "objective_events": {
        const rows = await this.repo.objectiveEventsAfter(cursor, upTo, take);
        return {
          facts: rows.flatMap((row) => {
            const fact = objectiveFact(row.kind, row.actorType);
            if (!fact) return [];
            const workspace = {
              userId: row.userId!,
              organizationId: row.organizationId,
            };
            return [
              {
                event: fact.event,
                key: row.id,
                occurredAt: row.occurredAt,
                workspace,
                actor: fact.actor,
                properties: {
                  objective_type: row.objectiveType,
                  source_type: row.sourceType,
                  ...(fact.event === "followup_objective_closed"
                    ? { closure_reason: row.closureReason ?? "unknown" }
                    : {}),
                },
              },
            ];
          }),
          last: lastOf(rows, (row) => row.occurredAt),
        };
      }
      case "lines_acquired": {
        const rows = await this.repo.linesAcquiredAfter(cursor, upTo, take);
        return {
          facts: rows.flatMap((row) => {
            const workspace = workspaceOfLedger(row);
            if (!workspace) return [];
            return [
              {
                event: "line_acquired" as const,
                key: `${row.kind}:${row.id}`,
                occurredAt: row.createdAt,
                workspace,
                humanUserId: row.userId,
                properties: {
                  line_kind: row.kind,
                  country_code: row.isoCountry,
                },
              },
            ];
          }),
          last: lastOf(rows, (row) => row.createdAt),
        };
      }
      case "followup_adoptions": {
        const rows = await this.activations.listAdoptedAfter(cursor, take);
        const due = rows.filter((row) => row.adoptedAt! <= upTo);
        return {
          facts: due.map((row) => {
            const scope = (row.scope ?? {}) as Record<string, unknown>;
            return {
              event: "followup_adoption_authorized" as const,
              key: `${row.id}:${row.adoptedAt!.toISOString()}`,
              occurredAt: row.adoptedAt!,
              workspace: {
                // An organization's row has no owner user; its key is the
                // organization's, and the person is the adopter.
                userId:
                  row.userId ?? row.adoptedByUserId ?? row.configuredByUserId,
                organizationId: row.organizationId,
              },
              humanUserId: row.adoptedByUserId,
              properties: {
                entry_source: row.entrySource,
                onboarding_version: row.version,
                scheduling_enabled: scope.scheduling === true,
                reminders_enabled: scope.reminders === true,
                reminder_offset_minutes: scope.reminderOffsetMinutes,
                existing_meetings_scope: scope.existingMeetings,
                included_meeting: Array.isArray(scope.includedMeetingIds)
                  ? scope.includedMeetingIds.length > 0
                  : false,
                readiness_state: scope.readinessState,
                missing_requirements: scope.missingRequirements,
              },
            };
          }),
          last: lastOf(due, (row) => row.adoptedAt!),
        };
      }
    }
  }

  private async adoptionsByWorkspace(
    keys: string[],
  ): Promise<Map<string, Date>> {
    const unique = [...new Set(keys)];
    const rows = await this.activations.findAdoptedForWorkspaceKeys(
      unique,
      FOLLOW_UP_ONBOARDING_VERSION,
    );
    return new Map(
      rows
        .filter((row) => row.adoptedAt)
        .map((row) => [row.workspaceKey, row.adoptedAt!]),
    );
  }

  // ── Delivery ───────────────────────────────────────────────────────

  /**
   * Ships due facts in bounded batches. A batch the provider refused as
   * invalid is not resent; transient failures back off exponentially up to a
   * bounded number of attempts, after which the row stays `failed` for
   * reconciliation. With analytics off, due rows are skipped.
   */
  async drain(now = new Date()): Promise<{
    sent: number;
    retried: number;
    failed: number;
    skipped: number;
  }> {
    const result = { sent: 0, retried: 0, failed: 0, skipped: 0 };
    try {
      if (!this.provider.enabled) {
        result.skipped = await this.repo.skipDue(now, DRAIN_BATCH * 10);
        return result;
      }
      for (let i = 0; i < DRAIN_MAX_BATCHES; i += 1) {
        const token = randomUUID();
        const claimed = await this.repo.claimDue({
          token,
          now,
          leaseUntil: new Date(now.getTime() + DRAIN_LEASE_MS),
          take: DRAIN_BATCH,
        });
        if (!claimed.length) break;
        const delivery = await this.provider.sendBatch(
          claimed.map((row) => ({
            uuid: row.id,
            event: row.event,
            distinctId: row.distinctId,
            timestamp: row.occurredAt,
            properties: row.properties as Record<string, unknown>,
          })),
        );
        const ids = claimed.map((row) => row.id);
        if (delivery.ok) {
          result.sent += await this.repo.markSent(ids, token, new Date());
          continue;
        }
        const attempts = Math.max(...claimed.map((row) => row.attemptCount));
        const giveUp = !delivery.retryable || attempts >= MAX_ATTEMPTS;
        const changed = await this.repo.markAttemptFailed(ids, token, {
          nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
          errorCode: delivery.code,
          giveUp,
        });
        if (giveUp) result.failed += changed;
        else result.retried += changed;
        // The provider is struggling: stop this tick, retry on the next.
        break;
      }
      await this.repo.pruneSettled(
        new Date(now.getTime() - RETENTION_MS),
        1_000,
      );
    } catch (error) {
      this.logger.warn(`Analytics drain failed: ${normalizeErrorCode(error)}`);
    }
    return result;
  }

  /** The projector then the drain — the orchestrator's single tick. */
  async tick(now = new Date()) {
    const projected = await this.project(now);
    const delivery = await this.drain(now);
    return { projected, ...delivery };
  }

  // ── Error tracking ─────────────────────────────────────────────────

  /**
   * Captures a technical exception of a scoped journey (number lookup, first
   * call, booking, AI activation, reminders and callbacks, receipts and
   * settlement). Expected product blockers — insufficient balance, empty
   * inventory, a cancelled checkout, a missing calendar — are not exceptions
   * and must not be passed here. The message, causes and stack are sanitized
   * before the SDK sees them; this never throws and never awaits delivery.
   */
  captureException(error: unknown, context: ExceptionCaptureContext): void {
    if (!this.provider.enabled || !this.provider.errorTrackingEnabled) return;
    try {
      const workspaceKey = context.workspace
        ? workspaceKeyOf(context.workspace)
        : null;
      const correlation: Record<string, AnalyticsPropertyValue> = {};
      for (const [key, value] of Object.entries(context.correlation ?? {})) {
        if (!/^[a-z_]{1,32}$/.test(key) || !value) continue;
        const clean = sanitizePropertyValue(value);
        if (typeof clean === "string")
          correlation[`correlation_${key}`] = clean;
      }
      const properties: Record<string, AnalyticsPropertyValue> = {
        schema_version: PRODUCT_ANALYTICS_SCHEMA_VERSION,
        environment: apiConfiguration.RINGEE_ENVIRONMENT,
        release_version: apiConfiguration.RINGEE_RELEASE,
        runtime: "server",
        component: boundedCode(context.component),
        operation: boundedCode(context.operation),
        journey_step: boundedCode(context.journeyStep),
        severity: context.severity ?? "error",
        error_code: normalizeErrorCode(error),
        ...(workspaceKey
          ? {
              workspace_key: workspaceKey,
              workspace_type: workspaceTypeOf(context.workspace!),
            }
          : {}),
        ...correlation,
      };
      this.provider.captureException(toSanitizedErrorObject(error), {
        distinctId:
          context.userId ??
          (workspaceKey
            ? technicalDistinctId("system", workspaceKey)
            : technicalDistinctId("system", "global")),
        properties,
        ...(workspaceKey
          ? { groups: { [ANALYTICS_WORKSPACE_GROUP]: workspaceKey } }
          : {}),
      });
    } catch {
      // Never let telemetry surface as a failure of the operation.
    }
  }
}

/**
 * A UUID derived from the fact's key: the same evidence always produces the
 * same id, so even a re-projected fact is deduplicated by the provider. Laid
 * out as an RFC 4122 name-based UUID (version 5 bits).
 */
export function analyticsEventUuid(eventKey: string): string {
  const hash = createHash("sha256")
    .update(`ringee-analytics:${eventKey}`)
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** The workspace a call belongs to, from its persisted ownership. */
function workspaceOfCall(call: {
  userId: string | null;
  organizationId: string | null;
}): OwnershipContext | null {
  if (!call.userId) return null;
  return { userId: call.userId, organizationId: call.organizationId ?? null };
}

function callDirection(
  direction: string | null,
): "inbound" | "outbound" | "unknown" {
  const value = (direction ?? "").toLowerCase();
  if (value.startsWith("in")) return "inbound";
  if (value.startsWith("out")) return "outbound";
  return "unknown";
}

/**
 * Which line an outbound human call went out on: the shared public number
 * (for trying Ringee; returned calls reach nobody) or the workspace's own.
 */
function callerIdKind(call: {
  direction: string | null;
  fromNumber: string;
}): "shared_number" | "own_number" | "inbound" {
  if (callDirection(call.direction) === "inbound") return "inbound";
  const shared = apiConfiguration.RINGEE_PUBLIC_CALLER_ID?.trim();
  return shared && call.fromNumber === shared ? "shared_number" : "own_number";
}

function workspaceOfLedger(row: {
  userId: string | null;
  organizationId: string | null;
}): OwnershipContext | null {
  if (row.organizationId) {
    return {
      userId: row.userId ?? row.organizationId,
      organizationId: row.organizationId,
    };
  }
  return row.userId ? { userId: row.userId, organizationId: null } : null;
}

function lastOf<T extends { id: string }>(
  rows: T[],
  at: (row: T) => Date,
): ProductAnalyticsCursorPosition | null {
  const last = rows[rows.length - 1];
  return last ? { at: at(last), id: last.id } : null;
}

function objectiveFact(
  kind: string,
  actorType: string,
): { event: BackendAnalyticsFact; actor: AnalyticsActorType } | null {
  switch (kind) {
    case "objective_initiated":
      return { event: "followup_objective_started", actor: "system" };
    case "objective_resolved":
      return { event: "followup_objective_resolved", actor: "ai" };
    case "objective_closed":
      return {
        event: "followup_objective_closed",
        actor: actorType === "human" ? "human" : "system",
      };
    default:
      return null;
  }
}

function backoffMs(attempts: number): number {
  return Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

function boundedCode(value: string): string {
  const clean = value.trim().slice(0, 64);
  return /^[A-Za-z0-9_.:-]+$/.test(clean) ? clean : "unspecified";
}
