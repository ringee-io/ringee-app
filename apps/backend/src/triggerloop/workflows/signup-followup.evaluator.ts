import { Injectable } from "@nestjs/common";
import {
  TriggerLoopAction,
  TriggerLoopEvaluateResult,
  TriggerLoopWorkflowKey,
} from "../types/triggerloop.types";
import {
  CLOSE_RESULT,
  WorkflowEvaluationContext,
  WorkflowEvaluator,
} from "./workflow-evaluator.interface";
import { countFiringsForStep, nextDelayForStep } from "./timing";

type SignupStepKey =
  | "firstCallFollowup"
  | "creditsFollowup"
  | "numberPurchaseFollowup"
  | "contactsImportFollowup"
  | "campaignsCallbacksAdoptionFollowup"
  | "teamSetupFollowup";

@Injectable()
export class SignupFollowupEvaluator implements WorkflowEvaluator {
  readonly workflowKey: TriggerLoopWorkflowKey = "signupFollowup";

  evaluate(ctx: WorkflowEvaluationContext): TriggerLoopEvaluateResult {
    const { signals, state } = ctx;
    const stepKey = this.pickStep(ctx);

    if (!stepKey) return CLOSE_RESULT;

    const firingIndex = countFiringsForStep(stepKey, state.sentActionKeys);
    const nextDelayMs = nextDelayForStep(stepKey, firingIndex);

    // Schedule exhausted for this step → stop nagging on this dimension.
    if (nextDelayMs === null && firingIndex > 0) {
      return CLOSE_RESULT;
    }

    const actions: TriggerLoopAction[] = [
      {
        type: "email",
        actionKey: `${stepKey}:email:${firingIndex}`,
        allowRepeat: false,
        payload: {
          template: `ringee.${stepKey}`,
          userId: signals.userId,
          email: signals.email,
          firstName: signals.firstName,
          organizationName: signals.organizationName,
          firingIndex,
        },
      },
    ];

    return {
      stepKey,
      close: false,
      nextDelayMs,
      actions,
    };
  }

  private pickStep(ctx: WorkflowEvaluationContext): SignupStepKey | null {
    const { signals } = ctx;

    if (!signals.firstCallCompleted) return "firstCallFollowup";
    if (!signals.creditsAdded) return "creditsFollowup";
    if (!signals.phoneNumberAssigned) return "numberPurchaseFollowup";
    if (!signals.contactsImported) return "contactsImportFollowup";

    const hasOutboundHabit =
      signals.hasCampaign || signals.hasCallbacks || signals.hasDncEntries;
    if (!hasOutboundHabit) return "campaignsCallbacksAdoptionFollowup";

    if (signals.isTeamAccount && signals.teamMembersCount <= 1) {
      return "teamSetupFollowup";
    }

    return null;
  }
}
