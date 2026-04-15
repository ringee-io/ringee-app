import { Injectable, Logger } from "@nestjs/common";
import { ResendProvider } from "@ringee/platform";
import { UserRepository } from "@ringee/database";
import {
  ActionExecutionContext,
  ActionHandler,
} from "./action-handler.interface";
import {
  TriggerLoopActionType,
  TriggerLoopExecuteActionResult,
} from "../types/triggerloop.types";
import { renderEmailTemplate } from "./email-templates";

interface EmailActionPayload {
  template: string;
  userId?: string;
  email?: string | null;
  firingIndex?: number;
}

@Injectable()
export class SendEmailActionHandler implements ActionHandler {
  readonly type: TriggerLoopActionType = "email";
  private readonly logger = new Logger(SendEmailActionHandler.name);
  private readonly provider = new ResendProvider();

  constructor(private readonly userRepository: UserRepository) {}

  async execute(
    ctx: ActionExecutionContext,
  ): Promise<TriggerLoopExecuteActionResult> {
    const payload = ctx.action.payload as unknown as EmailActionPayload;

    if (!payload?.template) {
      return { success: false, error: "missing template" };
    }

    const recipient = await this.resolveRecipient(payload);
    if (!recipient) {
      return { success: false, error: "recipient not resolvable" };
    }

    const content = renderEmailTemplate(payload.template, {
      firingIndex: payload.firingIndex,
    });
    if (!content) {
      return {
        success: false,
        error: `unknown template ${payload.template}`,
      };
    }

    const result = await this.provider.sendEmail(
      recipient,
      content.subject,
      content.body,
      undefined,
      undefined,
      'edisonpadilla.dev@gmail.com'
    );

    const externalReference =
      (result as { id?: string; data?: { id?: string } })?.id ??
      (result as { data?: { id?: string } })?.data?.id;

    if (!externalReference) {
      this.logger.warn(
        `Email send returned no id for action ${ctx.action.actionKey}`,
      );
      return { success: false, error: "email provider returned no id" };
    }

    return { success: true, externalReference };
  }

  private async resolveRecipient(
    payload: EmailActionPayload,
  ): Promise<string | null> {
    if (payload.email) return payload.email;
    if (!payload.userId) return null;

    const user = await this.userRepository.findById(payload.userId);
    const primary =
      (user as unknown as { emails?: { email: string; isPrimary: boolean }[] })
        ?.emails?.find((e) => e.isPrimary) ??
      (user as unknown as { emails?: { email: string }[] })?.emails?.[0];
    return primary?.email ?? null;
  }
}
