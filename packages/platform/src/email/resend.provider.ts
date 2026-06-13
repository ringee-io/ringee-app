import { Resend } from "resend";
import { EmailInterface } from "./email.interface";
import { apiConfiguration } from "@ringee/configuration";

const resend = new Resend(apiConfiguration.RESEND_API_KEY);

export class ResendProvider implements EmailInterface {
  name = "resend";
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
        ...(sendReplyEmail && sendReplyEmail),
      });

      return sends;
    } catch (err) {
      console.log(err);
    }

    return { sent: false };
  }
}
