import { Resend } from "resend";
import {
  EmailInterface,
  type EmailMessage,
  type EmailSendResult,
} from "./email.interface";
import { apiConfiguration } from "@ringee/configuration";

const resend = new Resend(apiConfiguration.RESEND_API_KEY);

/** Refusals worth another try later; everything else will fail the same way. */
const RETRYABLE_ERRORS = new Set([
  "rate_limit_exceeded",
  "application_error",
  "internal_server_error",
  "concurrent_idempotent_requests",
]);

export class ResendProvider implements EmailInterface {
  name = "resend";
  readonly idempotencyWindowMs = 24 * 60 * 60_000;
  validateEnvKeys = ["RESEND_API_KEY"];
  async sendEmail(
    to: string | string[],
    subject: string,
    html: string,
    emailFromName?: string,
    emailFromAddress?: string,
    // @ts-ignore
    replyTo?: string,
    cc?: string | string[],
    bcc?: string | string[],
  ) {
    try {
      const sendReplyEmail = !emailFromAddress?.includes("no-reply")
        ? { replyTo: "edisonpadilla.dev@gmail.com" }
        : false;

      const sends = await resend.emails.send({
        from: `${emailFromName || apiConfiguration.EMAIL_FROM_NAME} <${emailFromAddress || apiConfiguration.EMAIL_FROM_ADDRESS}>`,
        to,
        subject,
        html,
        ...(cc ? { cc } : {}),
        ...(bcc ? { bcc } : {}),
        ...(sendReplyEmail && sendReplyEmail),
      });

      return sends;
    } catch (err) {
      console.log(err);
    }

    return { sent: false };
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const { data, error } = await resend.emails.send(
        {
          from: `${message.fromName || apiConfiguration.EMAIL_FROM_NAME} <${message.fromAddress || apiConfiguration.EMAIL_FROM_ADDRESS}>`,
          to: message.to,
          subject: message.subject,
          html: message.html,
          ...(message.text ? { text: message.text } : {}),
          ...(message.cc?.length ? { cc: message.cc } : {}),
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          ...(message.headers ? { headers: message.headers } : {}),
        },
        message.idempotencyKey
          ? { idempotencyKey: message.idempotencyKey }
          : undefined,
      );
      if (error) {
        return {
          accepted: false,
          error: `${error.name}: ${error.message}`.slice(0, 500),
          retryable: RETRYABLE_ERRORS.has(error.name),
        };
      }
      return { accepted: true, providerEmailId: data?.id ?? null };
    } catch (err) {
      // The request may or may not have reached the provider. Retrying is
      // safe inside the idempotency window, and the caller's own record keeps
      // it from being retried blindly after that.
      return {
        accepted: false,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        retryable: true,
      };
    }
  }

  async getMessageId(providerEmailId: string): Promise<string | null> {
    try {
      const { data } = await resend.emails.get(providerEmailId);
      // Reported by the API but not yet typed by this SDK version.
      const messageId = (data as unknown as { message_id?: unknown } | null)
        ?.message_id;
      return typeof messageId === "string" && messageId.trim()
        ? messageId.trim()
        : null;
    } catch {
      return null;
    }
  }
}
