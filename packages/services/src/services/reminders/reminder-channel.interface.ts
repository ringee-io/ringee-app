/**
 * Delivery channel abstraction. Initially only `email` is implemented; new
 * channels (in_app, sms, whatsapp) plug in by implementing this interface and
 * registering with `REMINDER_CHANNELS` in the services module.
 *
 * The orchestration (loading subject data, building content, recording
 * delivery state) lives in ReminderService. Channels only know *how* to
 * send a pre-built message to a recipient.
 */
export type ReminderChannelKind = "email" | "in_app" | "sms" | "whatsapp";

export interface ReminderRecipient {
  userId: string;
  email?: string | null;
  name?: string | null;
  phoneNumber?: string | null;
}

export interface ReminderContent {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  /** Deep-link the user can follow to open the reminder's subject in-app. */
  deepLinkUrl?: string;
}

export interface ReminderChannel {
  readonly kind: ReminderChannelKind;
  send(recipient: ReminderRecipient, content: ReminderContent): Promise<void>;
}

export const REMINDER_CHANNELS = Symbol("REMINDER_CHANNELS");
