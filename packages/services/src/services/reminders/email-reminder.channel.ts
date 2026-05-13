import { Injectable, Logger } from "@nestjs/common";
import { ResendProvider } from "@ringee/platform";
import {
  ReminderChannel,
  ReminderChannelKind,
  ReminderContent,
  ReminderRecipient,
} from "./reminder-channel.interface";

@Injectable()
export class EmailReminderChannel implements ReminderChannel {
  readonly kind: ReminderChannelKind = "email";
  private readonly logger = new Logger(EmailReminderChannel.name);
  private readonly provider = new ResendProvider();

  async send(recipient: ReminderRecipient, content: ReminderContent) {
    if (!recipient.email) {
      throw new Error(
        `EmailReminderChannel: recipient ${recipient.userId} has no email`
      );
    }

    const result = await this.provider.sendEmail(
      recipient.email,
      content.subject,
      content.bodyHtml
    );

    this.logger.debug(
      `Reminder email dispatched to ${recipient.email}: ${content.subject}`
    );

    // ResendProvider swallows errors and returns { sent: false }; surface that
    // so the orchestrator records a failure rather than a phantom success.
    if (
      result &&
      typeof result === "object" &&
      "sent" in result &&
      result.sent === false
    ) {
      throw new Error("Resend provider reported send failure");
    }
  }
}
