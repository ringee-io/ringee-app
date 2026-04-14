import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter } from "events";
import {
  ActionExecutionContext,
  ActionHandler,
} from "./action-handler.interface";
import {
  TriggerLoopActionType,
  TriggerLoopExecuteActionResult,
} from "../types/triggerloop.types";

interface InternalEventPayload {
  name: string;
  data?: Record<string, unknown>;
}

/**
 * Bridges TriggerLoop-issued actions back into Ringee's in-process event bus.
 * Other modules can subscribe to `triggerloop.action` and react without the
 * workflow engine knowing about them. Replace with @nestjs/event-emitter if
 * the app adopts it.
 */
@Injectable()
export class InternalEventActionHandler implements ActionHandler {
  static readonly emitter = new EventEmitter();
  readonly type: TriggerLoopActionType = "internalEvent";
  private readonly logger = new Logger(InternalEventActionHandler.name);

  async execute(
    ctx: ActionExecutionContext,
  ): Promise<TriggerLoopExecuteActionResult> {
    const payload = ctx.action.payload as unknown as InternalEventPayload;

    if (!payload?.name) {
      return { success: false, error: "missing event name" };
    }

    InternalEventActionHandler.emitter.emit(payload.name, {
      subject: ctx.subject,
      workflowInstanceId: ctx.workflowInstanceId,
      data: payload.data ?? {},
    });

    this.logger.debug(
      `Emitted internal event ${payload.name} for ${ctx.subject.type}:${ctx.subject.id}`,
    );

    return {
      success: true,
      externalReference: `event:${payload.name}`,
    };
  }
}
