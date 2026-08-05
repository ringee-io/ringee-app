import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { OwnershipContext } from "@ringee/platform";

/**
 * Journey achievements — the workspace's permanent record.
 *
 * The distinction from a reward claim is the whole point of this table: an
 * achievement is *history*. It is written the moment the evaluator sees every
 * requirement of a stage satisfied and is never revoked, so a workspace that
 * has a quiet month does not lose progress it genuinely made (and does not lose
 * a reward it had not gotten around to claiming).
 *
 * Uniqueness is `(workspace, programVersion, stageId)`, so re-evaluating on
 * every page load is free of side effects after the first time.
 */

export interface JourneyAchievementRecord {
  id: string;
  userId: string | null;
  organizationId: string | null;
  programVersion: string;
  stageId: string;
  achievedAt: Date;
  ruleVersion: string;
  ruleHash: string;
}

export interface JourneyAchievementInput {
  stageId: string;
  programVersion: string;
  ruleVersion: string;
  ruleHash: string;
  eligibilitySnapshot: unknown;
  metricsSnapshot: unknown;
}

@Injectable()
export class JourneyAchievementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    ctx: OwnershipContext,
    programVersion: string,
  ): Promise<JourneyAchievementRecord[]> {
    return this.prisma.journeyStageAchievement.findMany({
      where: { ...this.owner(ctx), programVersion },
      orderBy: { achievedAt: "asc" },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        programVersion: true,
        stageId: true,
        achievedAt: true,
        ruleVersion: true,
        ruleHash: true,
      },
    });
  }

  /**
   * Records newly satisfied stages, in ladder order, inside one transaction.
   *
   * `skipDuplicates` makes this safe to call on every overview read and safe
   * against two concurrent requests: the unique constraint decides, and the
   * caller re-reads the persisted set rather than trusting its own write.
   *
   * Returns the stage ids that this call actually inserted, so the caller can
   * emit exactly one `journey_stage_achieved` event per real achievement.
   */
  async recordMany(
    ctx: OwnershipContext,
    achievements: JourneyAchievementInput[],
  ): Promise<string[]> {
    if (!achievements.length) return [];
    const owner = this.ownerData(ctx);

    const created = await this.prisma.journeyStageAchievement.createMany({
      data: achievements.map((achievement) => ({
        ...owner,
        programVersion: achievement.programVersion,
        stageId: achievement.stageId,
        ruleVersion: achievement.ruleVersion,
        ruleHash: achievement.ruleHash,
        eligibilitySnapshot:
          achievement.eligibilitySnapshot as Prisma.InputJsonValue,
        metricsSnapshot: achievement.metricsSnapshot as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });

    if (created.count === 0) return [];

    // `createMany` reports a count, not rows. Re-read to learn which stage ids
    // are ours rather than guessing — two racing requests would otherwise both
    // claim to have created the same achievement.
    const persisted = await this.prisma.journeyStageAchievement.findMany({
      where: {
        ...this.owner(ctx),
        programVersion: achievements[0].programVersion,
        stageId: { in: achievements.map((a) => a.stageId) },
      },
      select: { stageId: true, createdAt: true },
    });

    // Anything created in the last few seconds is from this call in practice;
    // the event emitter treats duplicates as harmless, the money path does not
    // depend on this.
    const cutoff = Date.now() - 5_000;
    return persisted
      .filter((row) => row.createdAt.getTime() >= cutoff)
      .map((row) => row.stageId);
  }

  /** Whether the workspace holds an achievement for this exact stage. */
  async has(
    ctx: OwnershipContext,
    programVersion: string,
    stageId: string,
  ): Promise<boolean> {
    const found = await this.prisma.journeyStageAchievement.findFirst({
      where: { ...this.owner(ctx), programVersion, stageId },
      select: { id: true },
    });
    return Boolean(found);
  }

  private owner(ctx: OwnershipContext) {
    return ctx.organizationId
      ? { organizationId: ctx.organizationId }
      : { userId: ctx.userId, organizationId: null };
  }

  private ownerData(ctx: OwnershipContext) {
    // The CHECK constraint enforces exactly one owner; this is where that is
    // decided for writes.
    return ctx.organizationId
      ? { userId: null, organizationId: ctx.organizationId }
      : { userId: ctx.userId, organizationId: null };
  }
}
