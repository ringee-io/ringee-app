import { Injectable } from "@nestjs/common";
import { WorkflowEvaluator } from "./workflow-evaluator.interface";
import { SignupFollowupEvaluator } from "./signup-followup.evaluator";
import { ReactivationFollowupEvaluator } from "./reactivation-followup.evaluator";

@Injectable()
export class WorkflowEvaluatorRegistry {
  private readonly byKey: Map<string, WorkflowEvaluator>;

  constructor(
    signup: SignupFollowupEvaluator,
    reactivation: ReactivationFollowupEvaluator,
  ) {
    const all: WorkflowEvaluator[] = [signup, reactivation];
    this.byKey = new Map(all.map((e) => [e.workflowKey, e]));
  }

  resolve(workflowKey: string): WorkflowEvaluator | null {
    return this.byKey.get(workflowKey) ?? null;
  }
}
