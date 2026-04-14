import { Injectable, Logger } from "@nestjs/common";
import {
  ActionExecutionContext,
  ActionHandler,
} from "./action-handler.interface";
import {
  TriggerLoopActionType,
  TriggerLoopExecuteActionResult,
} from "../types/triggerloop.types";

interface CreateTaskPayload {
  title: string;
  note?: string;
  assigneeUserId?: string;
  dueAt?: string;
}

/**
 * Placeholder for internal task creation. Ringee has CallbackTask today but
 * a generic "task" concept is still under design. Until that's shipped this
 * handler records the request and returns success so the workflow can keep
 * moving — swap the body for real persistence when the model lands.
 */
@Injectable()
export class CreateTaskActionHandler implements ActionHandler {
  readonly type: TriggerLoopActionType = "task";
  private readonly logger = new Logger(CreateTaskActionHandler.name);

  async execute(
    ctx: ActionExecutionContext,
  ): Promise<TriggerLoopExecuteActionResult> {
    const payload = ctx.action.payload as unknown as CreateTaskPayload;

    if (!payload?.title) {
      return { success: false, error: "missing title" };
    }

    this.logger.log(
      `[task] ${ctx.action.actionKey} for ${ctx.subject.type}:${ctx.subject.id} — ${payload.title}`,
    );

    return {
      success: true,
      externalReference: `task:${ctx.stepExecutionId}`,
    };
  }
}
