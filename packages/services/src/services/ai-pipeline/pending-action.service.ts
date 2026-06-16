import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AiPipelineActivationRepository,
  AiPipelineType,
  PendingAction,
  PendingActionFilterKey,
  PendingActionRepository,
  PendingActionStatus,
  Prisma,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { PendingActionDraft } from "./ai-pipeline.types";
import {
  PipelineContext,
  contextKey,
  contextOwnerColumns,
  toContextTypeEnum,
} from "./pipeline-context";

export interface DraftWithOwner {
  draft: PendingActionDraft;
  ownerUserId: string;
}

/**
 * Owns PendingAction persistence and the user's execution-center reads. Drafts
 * from any pipeline (rule or AI) are stamped with their (pipeline, context) here
 * — this is the only place actions are created, so isolation is guaranteed.
 */
@Injectable()
export class PendingActionService {
  constructor(
    private readonly repo: PendingActionRepository,
    private readonly activationRepo: AiPipelineActivationRepository,
  ) {}

  /**
   * Persist drafts for an enabled (pipeline, context). Grouped drafts are
   * upserted by groupKey so re-firing never duplicates. Returns how many new
   * actions were created.
   */
  async persistDrafts(
    ctx: PipelineContext,
    pipelineEnum: AiPipelineType,
    items: DraftWithOwner[],
  ): Promise<{ created: number; updated: number }> {
    if (items.length === 0) return { created: 0, updated: 0 };

    const owner = contextOwnerColumns(ctx);
    const ctxType = toContextTypeEnum(ctx);
    const key = contextKey(ctx);

    let created = 0;
    let updated = 0;

    for (const { draft, ownerUserId } of items) {
      const data: Prisma.PendingActionUncheckedCreateInput = {
        type: draft.type,
        status: PendingActionStatus.pending,
        priority: draft.priority,
        source: draft.source,
        title: draft.title,
        reason: draft.reason ?? null,
        suggestedMessage: draft.suggestedMessage ?? null,
        nextBestAction: draft.nextBestAction ?? null,
        dueAt: draft.dueAt ?? null,
        expiresAt: draft.expiresAt ?? null,
        countsTowardBadge: draft.countsTowardBadge ?? true,
        pipelineType: pipelineEnum,
        contextType: ctxType,
        contextKey: key,
        campaignId: owner.campaignId,
        organizationId: owner.organizationId,
        userId: ownerUserId,
        contactId: draft.contactId ?? null,
        callId: draft.callId ?? null,
        groupKey: draft.groupKey ?? null,
      };

      if (draft.groupKey) {
        const res = await this.repo.upsertByGroupKey(draft.groupKey, data);
        if (res.created) created++;
        else updated++;
      } else {
        await this.repo.create(data);
        created++;
      }
    }

    if (created > 0) {
      await this.activationRepo.adjustPendingActionCount(
        pipelineEnum,
        key,
        created,
      );
    }
    return { created, updated };
  }

  // ── Reads / mutations for the execution center ──

  list(
    ctx: OwnershipContext,
    options?: {
      filter?: PendingActionFilterKey;
      status?: PendingActionStatus;
      contextKey?: string;
      /** Narrow org-wide results to a single member (admin filter / member self). */
      memberUserId?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.repo.list(
      { userId: ctx.userId, organizationId: ctx.organizationId ?? null },
      options,
    );
  }

  /** The sidebar badge always reflects the caller's own actionable items. */
  badgeCount(ctx: OwnershipContext): Promise<number> {
    return this.repo.badgeCount(
      { userId: ctx.userId, organizationId: ctx.organizationId ?? null },
      ctx.userId,
    );
  }

  async complete(ctx: OwnershipContext, id: string): Promise<PendingAction> {
    const action = await this.requireOwned(ctx, id);
    const updated = await this.repo.updateStatus(
      id,
      PendingActionStatus.completed,
      { completedAt: new Date() },
    );
    await this.decrementIfWasPending(action);
    return updated;
  }

  async dismiss(ctx: OwnershipContext, id: string): Promise<PendingAction> {
    const action = await this.requireOwned(ctx, id);
    const updated = await this.repo.updateStatus(
      id,
      PendingActionStatus.dismissed,
      { completedAt: new Date() },
    );
    await this.decrementIfWasPending(action);
    return updated;
  }

  async snooze(
    ctx: OwnershipContext,
    id: string,
    snoozedUntil: Date,
  ): Promise<PendingAction> {
    await this.requireOwned(ctx, id);
    return this.repo.updateStatus(id, PendingActionStatus.snoozed, {
      snoozedUntil,
    });
  }

  private async requireOwned(
    ctx: OwnershipContext,
    id: string,
  ): Promise<PendingAction> {
    const action = await this.repo.findById(id);
    if (!action) throw new NotFoundException("Pending action not found");
    if (ctx.organizationId) {
      if (action.organizationId !== ctx.organizationId) {
        throw new ForbiddenException("Access denied");
      }
    } else if (action.userId !== ctx.userId || action.organizationId !== null) {
      throw new ForbiddenException("Access denied");
    }
    return action;
  }

  private async decrementIfWasPending(action: PendingAction): Promise<void> {
    if (
      action.status === PendingActionStatus.pending &&
      action.pipelineType &&
      action.contextKey
    ) {
      await this.activationRepo.adjustPendingActionCount(
        action.pipelineType,
        action.contextKey,
        -1,
      );
    }
  }
}
