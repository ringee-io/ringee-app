import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { TriggerLoopActionExecutionRepository } from "@ringee/database";
import { ActionHandlerRegistry } from "../actions/action-handler.registry";
import {
  TriggerLoopAction,
  TriggerLoopExecuteActionResult,
  TriggerLoopSubject,
} from "../types/triggerloop.types";

export interface ExecuteActionInput {
  workflowKey: string;
  workflowInstanceId: string;
  stepExecutionId: string;
  subject: TriggerLoopSubject;
  action: TriggerLoopAction;
}

@Injectable()
export class TriggerLoopActionExecutionService {
  private readonly logger = new Logger(TriggerLoopActionExecutionService.name);

  constructor(
    private readonly registry: ActionHandlerRegistry,
    private readonly executions: TriggerLoopActionExecutionRepository,
  ) {}

  async execute(
    input: ExecuteActionInput,
  ): Promise<TriggerLoopExecuteActionResult> {
    const handler = this.registry.resolve(input.action.type);
    if (!handler) {
      return {
        success: false,
        error: `no handler for action type ${input.action.type}`,
      };
    }

    // ── Idempotency gate ─────────────────────────────────────────────────
    // TriggerLoop may retry executeAction if our HTTP response was lost.
    // For actions with allowRepeat=false we MUST NOT run the side effect
    // (e.g. resend an email) twice. The key is (workflowInstanceId, actionKey)
    // because TriggerLoop guarantees actionKey uniqueness within an instance
    // for non-repeatable actions. For allowRepeat=true, skip the gate — the
    // caller opted in to re-execution (e.g. repeating reminders use distinct
    // keys per firing, so natural uniqueness still applies).
    if (!input.action.allowRepeat) {
      const cached = await this.executions.findByKey({
        workflowInstanceId: input.workflowInstanceId,
        actionKey: input.action.actionKey,
      });

      if (cached?.success) {
        this.logger.debug(
          `Idempotent hit for ${input.action.actionKey} — returning cached result`,
        );
        return {
          success: true,
          externalReference: cached.externalReference ?? undefined,
        };
      }
    }

    let result: TriggerLoopExecuteActionResult;
    try {
      result = await handler.execute({
        workflowKey: input.workflowKey,
        workflowInstanceId: input.workflowInstanceId,
        stepExecutionId: input.stepExecutionId,
        subject: input.subject,
        action: input.action,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Action ${input.action.actionKey} (${input.action.type}) failed: ${message}`,
      );
      result = { success: false, error: message };
    }

    // Persist the outcome either way so retries can short-circuit on the
    // next call (on success) or increment attemptCount (on failure). Writes
    // are best-effort: a DB outage must not turn into a 500 to TriggerLoop.
    try {
      await this.executions.recordResult({
        workflowInstanceId: input.workflowInstanceId,
        actionKey: input.action.actionKey,
        actionType: input.action.type,
        workflowKey: input.workflowKey,
        subjectType: input.subject?.type || "unknown",
        subjectId: input.subject?.id || "unknown",
        success: result.success,
        externalReference: result.externalReference ?? null,
        errorMessage: result.error ?? null,
        payload: (input.action.payload ?? null) as Prisma.InputJsonValue | null,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist execution record for ${input.action.actionKey}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return result;
  }
}
