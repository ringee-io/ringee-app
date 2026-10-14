import {
  EmailInterface,
  type EmailMessage,
  type EmailSendResult,
} from "./email.interface";

export class EmptyProvider implements EmailInterface {
  name = "no provider";
  validateEnvKeys = [];
  async sendEmail(to: string | string[], subject: string, html: string) {
    return `No email provider found, email was supposed to be sent to ${to} with subject: ${subject} and ${html}, html`;
  }

  async send(_message: EmailMessage): Promise<EmailSendResult> {
    return {
      accepted: false,
      error: "No email provider is configured.",
      retryable: false,
    };
  }

  async getMessageId(): Promise<string | null> {
    return null;
  }
}
