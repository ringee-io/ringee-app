import { Injectable } from "@nestjs/common";
import { ActionHandler } from "./action-handler.interface";
import { SendEmailActionHandler } from "./send-email.handler";
import { SendNotificationActionHandler } from "./send-notification.handler";
import { CreateTaskActionHandler } from "./create-task.handler";
import { InternalEventActionHandler } from "./internal-event.handler";
import { TriggerLoopActionType } from "../types/triggerloop.types";

@Injectable()
export class ActionHandlerRegistry {
  private readonly byType: Map<TriggerLoopActionType, ActionHandler>;

  constructor(
    email: SendEmailActionHandler,
    notification: SendNotificationActionHandler,
    task: CreateTaskActionHandler,
    internalEvent: InternalEventActionHandler,
  ) {
    const all: ActionHandler[] = [email, notification, task, internalEvent];
    this.byType = new Map(all.map((h) => [h.type, h]));
  }

  resolve(type: TriggerLoopActionType): ActionHandler | null {
    return this.byType.get(type) ?? null;
  }
}
