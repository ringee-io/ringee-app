import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { TriggerLoopSignalService } from "./triggerloop-signal.service";
import { WorkflowEvaluatorRegistry } from "../workflows/workflow-evaluator.registry";
import { CLOSE_RESULT } from "../workflows/workflow-evaluator.interface";
import {
  TriggerLoopEvaluateResult,
  TriggerLoopSubject,
  TriggerLoopWorkflowState,
} from "../types/triggerloop.types";

export interface EvaluateInput {
  workflowKey: string;
  workflowInstanceId: string;
  subject: TriggerLoopSubject;
  state: TriggerLoopWorkflowState;
}

@Injectable()
export class TriggerLoopEvaluationService {
  private readonly logger = new Logger(TriggerLoopEvaluationService.name);

  constructor(
    private readonly signals: TriggerLoopSignalService,
    private readonly registry: WorkflowEvaluatorRegistry,
  ) {}

  async evaluate(input: EvaluateInput): Promise<TriggerLoopEvaluateResult> {
    if (input.subject.type !== "user") {
      throw new BadRequestException(
        `Unsupported subject type: ${input.subject.type}`,
      );
    }

    const evaluator = this.registry.resolve(input.workflowKey);
    if (!evaluator) {
      this.logger.warn(
        `No evaluator registered for workflow ${input.workflowKey}; closing`,
      );
      return CLOSE_RESULT;
    }

    const signals = await this.signals.collectForUser(input.subject.id);

    return evaluator.evaluate({
      workflowInstanceId: input.workflowInstanceId,
      signals,
      state: input.state,
    });
  }
}
