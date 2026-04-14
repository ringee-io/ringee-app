import { Injectable } from "@nestjs/common";
import {
  TriggerLoopEvaluateResult,
  TriggerLoopWorkflowKey,
} from "../types/triggerloop.types";
import {
  CLOSE_RESULT,
  WorkflowEvaluationContext,
  WorkflowEvaluator,
} from "./workflow-evaluator.interface";
import { countFiringsForStep, nextDelayForStep } from "./timing";

const STEP_KEY = "reactivationFollowup";

@Injectable()
export class ReactivationFollowupEvaluator implements WorkflowEvaluator {
  readonly workflowKey: TriggerLoopWorkflowKey = "reactivationFollowup";

  evaluate(ctx: WorkflowEvaluationContext): TriggerLoopEvaluateResult {
    const { signals, state } = ctx;

    // The user came back → nothing more to do.
    if (signals.active) return CLOSE_RESULT;

    // Reactivation only makes sense for users who actually started using the
    // product. Otherwise signupFollowup handles it.
    if (!signals.firstCallCompleted) return CLOSE_RESULT;

    const firingIndex = countFiringsForStep(STEP_KEY, state.sentActionKeys);
    const nextDelayMs = nextDelayForStep(STEP_KEY, firingIndex);

    if (nextDelayMs === null && firingIndex > 0) {
      return CLOSE_RESULT;
    }

    return {
      stepKey: STEP_KEY,
      close: false,
      nextDelayMs,
      actions: [
        {
          type: "email",
          actionKey: `${STEP_KEY}:email:${firingIndex}`,
          allowRepeat: false,
          payload: {
            template: `ringee.${STEP_KEY}`,
            userId: signals.userId,
            email: signals.email,
            firingIndex,
            inactiveSince: signals.lastActivityAt?.toISOString() ?? null,
          },
        },
      ],
    };
  }
}
