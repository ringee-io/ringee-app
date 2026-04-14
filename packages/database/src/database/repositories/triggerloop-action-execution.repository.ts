import { Injectable } from "@nestjs/common";
// NOTE: TriggerLoopActionExecution is a runtime-known Prisma model added by
// a schema migration. Types resolve once `pnpm prisma:generate` is run.
// We alias the delegate through a narrow interface to keep the rest of the
// repository strictly typed.
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

export interface TriggerLoopActionExecutionRecord {
  id: string;
  workflowInstanceId: string;
  actionKey: string;
  actionType: string;
  workflowKey: string;
  subjectType: string;
  subjectId: string;
  success: boolean;
  externalReference: string | null;
  errorMessage: string | null;
  attemptCount: number;
  payload: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActionExecutionKey {
  workflowInstanceId: string;
  actionKey: string;
}

@Injectable()
export class TriggerLoopActionExecutionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get delegate() {
    // Cast to the generated delegate shape once.
    return (this.prisma as unknown as {
      triggerLoopActionExecution: {
        findUnique: (args: unknown) => Promise<TriggerLoopActionExecutionRecord | null>;
        upsert: (args: unknown) => Promise<TriggerLoopActionExecutionRecord>;
      };
    }).triggerLoopActionExecution;
  }

  findByKey(
    key: ActionExecutionKey,
  ): Promise<TriggerLoopActionExecutionRecord | null> {
    return this.delegate.findUnique({
      where: {
        workflowInstanceId_actionKey: {
          workflowInstanceId: key.workflowInstanceId,
          actionKey: key.actionKey,
        },
      },
    });
  }

  /**
   * Atomic upsert of the execution record. Multiple concurrent webhook
   * deliveries for the same (workflow, action) pair collapse into one row
   * thanks to the unique constraint; later calls bump attemptCount instead
   * of inserting duplicates.
   */
  async recordResult(input: {
    workflowInstanceId: string;
    actionKey: string;
    actionType: string;
    workflowKey: string;
    subjectType: string;
    subjectId: string;
    success: boolean;
    externalReference: string | null;
    errorMessage: string | null;
    payload: Prisma.InputJsonValue | null;
  }): Promise<TriggerLoopActionExecutionRecord> {
    return this.delegate.upsert({
      where: {
        workflowInstanceId_actionKey: {
          workflowInstanceId: input.workflowInstanceId,
          actionKey: input.actionKey,
        },
      },
      create: {
        workflowInstanceId: input.workflowInstanceId,
        actionKey: input.actionKey,
        actionType: input.actionType,
        workflowKey: input.workflowKey,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        success: input.success,
        externalReference: input.externalReference,
        errorMessage: input.errorMessage,
        payload: input.payload ?? Prisma.JsonNull,
        attemptCount: 1,
      },
      update: {
        // Only upgrade the record on success — a later successful attempt
        // should overwrite an earlier failure; but never downgrade a prior
        // success back to failure just because TriggerLoop re-delivered.
        success: input.success ? true : undefined,
        externalReference: input.success
          ? input.externalReference ?? undefined
          : undefined,
        errorMessage: input.success ? null : input.errorMessage,
        attemptCount: { increment: 1 },
      },
    });
  }
}
