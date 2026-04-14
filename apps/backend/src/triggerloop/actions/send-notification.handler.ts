import { Injectable, Logger } from "@nestjs/common";
import { NotificationService } from "@ringee/platform";
import { UserDeviceRepository } from "@ringee/database";
import {
  ActionExecutionContext,
  ActionHandler,
} from "./action-handler.interface";
import {
  TriggerLoopActionType,
  TriggerLoopExecuteActionResult,
} from "../types/triggerloop.types";

interface NotificationActionPayload {
  title: string;
  body: string;
  userId?: string;
  data?: Record<string, string>;
}

@Injectable()
export class SendNotificationActionHandler implements ActionHandler {
  readonly type: TriggerLoopActionType = "notification";
  private readonly logger = new Logger(SendNotificationActionHandler.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly devices: UserDeviceRepository,
  ) {}

  async execute(
    ctx: ActionExecutionContext,
  ): Promise<TriggerLoopExecuteActionResult> {
    const payload = ctx.action.payload as unknown as NotificationActionPayload;

    if (!payload?.title || !payload?.body) {
      return { success: false, error: "missing title or body" };
    }

    const userId = payload.userId ?? ctx.subject.id;

    // Best-effort: repositories may expose different method names across
    // the codebase; if it's missing, fail the action cleanly so TriggerLoop
    // can decide to retry or skip.
    const list = (
      this.devices as unknown as {
        findActiveByUser?: (id: string) => Promise<{ fcmToken?: string | null }[]>;
      }
    ).findActiveByUser;
    if (!list) {
      return {
        success: false,
        error: "UserDeviceRepository.findActiveByUser not implemented",
      };
    }

    const devices = await list.call(this.devices, userId);
    const tokens = devices.map((d) => d.fcmToken).filter((t): t is string => !!t);

    if (tokens.length === 0) {
      return { success: false, error: "no device tokens for user" };
    }

    await Promise.all(
      tokens.map((token) =>
        this.notifications.sendNotification(token, {
          title: payload.title,
          body: payload.body,
          data: payload.data,
        }),
      ),
    );

    return {
      success: true,
      externalReference: `fcm:${tokens.length}`,
    };
  }
}
