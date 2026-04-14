import { Module } from "@nestjs/common";
import { NotificationModule } from "@ringee/platform";
import { TriggerLoopController } from "./triggerloop.controller";
import { TriggerLoopClient } from "./services/triggerloop.client";
import { TriggerLoopSignalService } from "./services/triggerloop-signal.service";
import { TriggerLoopEvaluationService } from "./services/triggerloop-evaluation.service";
import { TriggerLoopActionExecutionService } from "./services/triggerloop-action-execution.service";
import { TriggerLoopEventPublisher } from "./services/triggerloop-event-publisher.service";
import { TriggerLoopOutboxService } from "./services/triggerloop-outbox.service";
import { TriggerLoopOutboxScheduler } from "./services/triggerloop-outbox.scheduler";
import { TriggerLoopActivityService } from "./services/triggerloop-activity.service";
import { TriggerLoopInactivityScheduler } from "./services/triggerloop-inactivity.scheduler";
import { SignupFollowupEvaluator } from "./workflows/signup-followup.evaluator";
import { ReactivationFollowupEvaluator } from "./workflows/reactivation-followup.evaluator";
import { WorkflowEvaluatorRegistry } from "./workflows/workflow-evaluator.registry";
import { SendEmailActionHandler } from "./actions/send-email.handler";
import { SendNotificationActionHandler } from "./actions/send-notification.handler";
import { CreateTaskActionHandler } from "./actions/create-task.handler";
import { InternalEventActionHandler } from "./actions/internal-event.handler";
import { ActionHandlerRegistry } from "./actions/action-handler.registry";

@Module({
  imports: [NotificationModule],
  controllers: [TriggerLoopController],
  providers: [
    TriggerLoopClient,
    TriggerLoopOutboxService,
    TriggerLoopOutboxScheduler,
    TriggerLoopActivityService,
    TriggerLoopInactivityScheduler,
    TriggerLoopSignalService,
    TriggerLoopEvaluationService,
    TriggerLoopActionExecutionService,
    TriggerLoopEventPublisher,
    SignupFollowupEvaluator,
    ReactivationFollowupEvaluator,
    WorkflowEvaluatorRegistry,
    SendEmailActionHandler,
    SendNotificationActionHandler,
    CreateTaskActionHandler,
    InternalEventActionHandler,
    ActionHandlerRegistry,
  ],
  exports: [
    TriggerLoopEventPublisher,
    TriggerLoopClient,
    TriggerLoopOutboxService,
    TriggerLoopActivityService,
  ],
})
export class TriggerLoopModule {}
