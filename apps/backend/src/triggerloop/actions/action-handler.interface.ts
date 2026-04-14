import {
  TriggerLoopAction,
  TriggerLoopActionType,
  TriggerLoopExecuteActionResult,
  TriggerLoopSubject,
} from "../types/triggerloop.types";

export interface ActionExecutionContext {
  workflowKey: string;
  workflowInstanceId: string;
  stepExecutionId: string;
  subject: TriggerLoopSubject;
  action: TriggerLoopAction;
}

export interface ActionHandler {
  readonly type: TriggerLoopActionType;
  execute(ctx: ActionExecutionContext): Promise<TriggerLoopExecuteActionResult>;
}
