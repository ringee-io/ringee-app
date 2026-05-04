import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Public } from "@ringee/platform";
import { TriggerLoopWebhookDto } from "./dto/webhook.dto";
import { TriggerLoopEvaluationService } from "./services/triggerloop-evaluation.service";
import { TriggerLoopActionExecutionService } from "./services/triggerloop-action-execution.service";
import { TriggerLoopWebhookGuard } from "./triggerloop-webhook.guard";
import {
  TriggerLoopEvaluateResult,
  TriggerLoopExecuteActionResult,
} from "./types/triggerloop.types";

@Public()
@UseGuards(TriggerLoopWebhookGuard)
@Controller("internal/triggerloop")
export class TriggerLoopController {
  constructor(
    private readonly evaluation: TriggerLoopEvaluationService,
    private readonly execution: TriggerLoopActionExecutionService,
  ) {}

  @Post("webhook")
  @HttpCode(200)
  async handle(
    @Body() dto: TriggerLoopWebhookDto,
  ): Promise<TriggerLoopEvaluateResult | TriggerLoopExecuteActionResult> {
    switch (dto.operation) {
      case "evaluate": {
        if (!dto.state) {
          throw new BadRequestException("state is required for evaluate");
        }
        return this.evaluation.evaluate({
          workflowKey: dto.workflowKey,
          workflowInstanceId: dto.workflowInstanceId,
          subject: dto.subject,
          state: dto.state,
        });
      }

      case "executeAction": {
        if (!dto.stepExecutionId || !dto.action) {
          throw new BadRequestException(
            "stepExecutionId and action are required for executeAction",
          );
        }
        return this.execution.execute({
          workflowKey: dto.workflowKey,
          workflowInstanceId: dto.workflowInstanceId,
          stepExecutionId: dto.stepExecutionId,
          subject: dto.subject,
          action: dto.action,
        });
      }
    }
  }
}
