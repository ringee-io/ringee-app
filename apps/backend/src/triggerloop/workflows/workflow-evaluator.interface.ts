import {
  TriggerLoopEvaluateResult,
  TriggerLoopWorkflowKey,
  UserBusinessSignals,
} from "../types/triggerloop.types";

export interface WorkflowEvaluationContext {
  workflowInstanceId: string;
  signals: UserBusinessSignals;
  state: {
    currentStepKey: string | null;
    sentStepKeys: string[];
    sentActionKeys: string[];
    executionCount: number;
  };
}

export interface WorkflowEvaluator {
  readonly workflowKey: TriggerLoopWorkflowKey;
  evaluate(ctx: WorkflowEvaluationContext): TriggerLoopEvaluateResult;
}

export const CLOSE_RESULT: TriggerLoopEvaluateResult = {
  stepKey: null,
  close: true,
  nextDelayMs: null,
  actions: [],
};
