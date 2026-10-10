import { Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  Call,
  ContactRepository,
  ContactWithLatestNotes,
  InboxThread,
  InboxThreadRepository,
  OrganizationRepository,
  User,
  UserEmail,
  UserRepository,
} from "@ringee/database";
import {
  normalizePhoneE164,
  OwnershipContext,
  RedisService,
  ResendProvider,
} from "@ringee/platform";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { isMissedInboundCall, missedCallRecipientId } from "./missed-call";

/**
 * Race guard only: the event that triggers the email is written once per call,
 * so this just stops two deliveries of the same hangup, processed at the same
 * instant, from both sending it.
 */
const MISSED_CALL_EMAIL_DEDUP_SECONDS = 7 * 24 * 60 * 60;

/** The most recent notes an email carries; the contact page has the rest. */
const NOTE_LIMIT = 5;

/** A longer note is cut, so a single long one does not bury the others. */
const NOTE_MAX_CHARS = 600;

/** The most addresses the email provider takes on one message. */
const MAX_RECIPIENTS_PER_EMAIL = 50;

/**
 * Waits before each new attempt when the provider refuses a send — a rate
 * limit or a blip must not leave a missed call unannounced.
 */
const RETRY_DELAYS_MS = [2_000, 5_000];

const NO_REPLY_ADDRESS = "no-reply@notifications.ringee.io";

type UserWithEmails = User & { emails?: UserEmail[] };

/** Who an email goes to: the person the call is for, or the whole team. */
export type MissedCallAudience = "owner" | "team";

/**
 * Emails a missed inbound call (CALL-015): who called, the contact's details
 * and latest notes, and a link to call them back.
 *
 * It always reaches someone. It goes to whoever's "My day" queue lists the
 * call — the conversation's assignee, or the owner of the line — so the email
 * and the queue agree. In an organization, when that person cannot be emailed
 * (they have left, or have no address), it goes to the whole team instead; a
 * personal workspace has only its owner to tell.
 *
 * Best-effort, like every transactional email here: it hangs off a provider
 * webhook, so a refused send is retried a couple of times and then logged,
 * and a failure never fails the call's processing.
 */
@Injectable()
export class MissedCallNotificationService {
  private readonly logger = new Logger(MissedCallNotificationService.name);
  private readonly email = new ResendProvider();
  private readonly retryDelaysMs: readonly number[] = RETRY_DELAYS_MS;

  constructor(
    private readonly threads: InboxThreadRepository,
    private readonly contacts: ContactRepository,
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
    private readonly redis: RedisService,
  ) {}

  /** `threadId` is the conversation the missed call was just written on. */
  async notify(call: Call, threadId: string): Promise<void> {
    try {
      if (!isMissedInboundCall(call) || !call.userId) return;
      const ctx: OwnershipContext = {
        userId: call.userId,
        organizationId: call.organizationId ?? null,
      };

      const thread = await this.threads.findById(threadId);
      const audience = await this.resolveAudience(ctx, thread);
      if (audience.addresses.length === 0) {
        this.logger.warn(
          `Missed call ${call.id}: nobody in the workspace has an email address to tell`,
        );
        return;
      }
      if (!(await this.claim(call.id))) return;

      // Null for a withheld caller id: still announced, never called back.
      const callerNumber = normalizePhoneE164(call.fromNumber);
      const contact = await this.findContact(ctx, call, thread, callerNumber);
      const workspaceName = ctx.organizationId
        ? ((
            await this.organizations
              .findById(ctx.organizationId)
              .catch(() => null)
          )?.name ?? null)
        : null;

      const view: MissedCallView = {
        audience: audience.kind,
        callerNumber,
        lineNumber: normalizePhoneE164(call.toNumber),
        workspaceName,
        contact,
      };
      const subject = buildMissedCallSubject(view);
      const html = buildMissedCallHtml(view);

      let delivered = 0;
      for (
        let i = 0;
        i < audience.addresses.length;
        i += MAX_RECIPIENTS_PER_EMAIL
      ) {
        const batch = audience.addresses.slice(i, i + MAX_RECIPIENTS_PER_EMAIL);
        if (await this.send(batch, subject, html, call.id)) {
          delivered += batch.length;
        }
      }
      if (delivered > 0) {
        this.logger.log(
          `📧 Missed-call email for call ${call.id} sent to ${delivered} address(es) (${audience.kind})`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to send the missed-call email for call ${call.id}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * The person the call is for, while they can be emailed; otherwise, in an
   * organization, every member. Membership is checked on the way: contact
   * notes never go to someone who has left the workspace.
   */
  private async resolveAudience(
    ctx: OwnershipContext,
    thread: InboxThread | null,
  ): Promise<{ kind: MissedCallAudience; addresses: string[] }> {
    if (!ctx.organizationId) {
      const owner = (await this.users.findById(
        ctx.userId,
      )) as UserWithEmails | null;
      const address = primaryAddress(owner);
      return { kind: "owner", addresses: address ? [address] : [] };
    }

    const ownerId = thread ? missedCallRecipientId(thread) : ctx.userId;
    if (
      ownerId &&
      (await this.organizations.isMember(ownerId, ctx.organizationId))
    ) {
      const owner = (await this.users.findById(
        ownerId,
      )) as UserWithEmails | null;
      const address = primaryAddress(owner);
      if (address) return { kind: "owner", addresses: [address] };
    }

    const members = await this.organizations.findMembersWithEmails(
      ctx.organizationId,
    );
    return {
      kind: "team",
      addresses: [
        ...new Set(
          members
            .map(primaryAddress)
            .filter((address): address is string => !!address),
        ),
      ],
    };
  }

  /**
   * The conversation's contact first: it is the one the queue shows, and a
   * person may have linked it by hand to the caller's second number.
   */
  private async findContact(
    ctx: OwnershipContext,
    call: Call,
    thread: InboxThread | null,
    callerNumber: string | null,
  ): Promise<ContactWithLatestNotes | null> {
    const contactId =
      thread?.contactId ??
      call.contactId ??
      (callerNumber
        ? (await this.contacts.findByPhone(ctx, call.fromNumber))?.id
        : null) ??
      null;
    return contactId
      ? this.contacts.findWithLatestNotesForOwner(ctx, contactId, NOTE_LIMIT)
      : null;
  }

  /** True once the provider accepted the email; retried while it refuses. */
  private async send(
    to: string[],
    subject: string,
    html: string,
    callId: string,
  ): Promise<boolean> {
    for (let attempt = 0; ; attempt++) {
      const result: unknown = await this.email
        .sendEmail(to, subject, html, "Ringee", NO_REPLY_ADDRESS)
        .catch((error: Error) => ({ error }));
      if (wasAccepted(result)) return true;
      const delay = this.retryDelaysMs[attempt];
      if (delay === undefined) {
        this.logger.warn(
          `Missed-call email for call ${callId} was not sent after ${attempt + 1} attempts`,
        );
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  /**
   * False when this call's email is already being sent. Redis being down must
   * not cost the person the email, so a failure lets it through.
   */
  private async claim(callId: string): Promise<boolean> {
    const key = `missed-call-email:${callId}`;
    try {
      return await this.redis.setIfAbsent(
        key,
        new Date().toISOString(),
        MISSED_CALL_EMAIL_DEDUP_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `Dedupe check failed for ${key}: ${(err as Error).message}`,
      );
      return true;
    }
  }
}

export interface MissedCallView {
  audience: MissedCallAudience;
  /** The number that called, in E.164; null when the caller hid it. */
  callerNumber: string | null;
  /** The workspace's number it called, when it reads as one. */
  lineNumber: string | null;
  /** The organization's name; null in a personal workspace. */
  workspaceName: string | null;
  /** Null for a caller who is not a saved contact. */
  contact: ContactWithLatestNotes | null;
}

export function buildMissedCallSubject(view: MissedCallView): string {
  const from =
    callerName(view) ??
    (view.callerNumber ? formatPhone(view.callerNumber) : "a private number");
  return `Missed call from ${from}`;
}

/**
 * Plain, like the other transactional emails: what happened and the link to
 * act on it first, then the contact and their notes, so whoever calls back
 * knows who they are calling before they dial.
 */
export function buildMissedCallHtml(view: MissedCallView): string {
  const base = (apiConfiguration.FRONTEND_URL ?? "").replace(/\/+$/, "");
  const contact = view.contact;
  const contactUrl = contact ? `${base}/dashboard/contact/${contact.id}` : null;
  // The Call page puts a `phoneNumber` it is given in its search, ready to
  // dial; it does not dial on its own.
  const callBackUrl = view.callerNumber
    ? `${base}/dashboard/call?phoneNumber=${view.callerNumber.replace(/\D/g, "")}`
    : null;
  const name = callerName(view);
  const phoneNumber = view.callerNumber ?? contact?.phoneNumber ?? null;
  const phone = phoneNumber ? formatPhone(phoneNumber) : null;
  const team = view.audience === "team";

  const who = name ?? phone;
  const lead = who
    ? `<strong>${escapeHtml(who)}</strong> called`
    : "A caller with a hidden number called";
  const line = view.lineNumber
    ? ` your line ${escapeHtml(formatPhone(view.lineNumber))}`
    : " you";
  const workspace = view.workspaceName
    ? ` in ${escapeHtml(view.workspaceName)}`
    : "";
  const next = !callBackUrl
    ? `Their number was hidden, so they can't be called back.${team ? " This went to the whole team." : ""}`
    : team
      ? "This went to the whole team — whoever is free, call them back."
      : "They're waiting in Today's queue on your Call page.";

  const location = contact
    ? [contact.locationCity, contact.locationRegion, contact.locationCountry]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(", ")
    : "";
  const tags = contact?.tags.map(({ tag }) => tag.name).join(", ") ?? "";
  const rows = (
    [
      ["Name", name],
      ["Phone", phone],
      ["Email", contact?.email],
      ["Company", contact?.company],
      ["Job title", contact?.jobTitle],
      ["Location", location],
      ["Tags", tags],
    ] as [string, string | null | undefined][]
  )
    .filter((entry): entry is [string, string] => !!entry[1]?.trim())
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#737373;vertical-align:top;">${label}</td><td style="padding:4px 0;">${escapeHtml(value.trim())}</td></tr>`,
    )
    .join("");

  const notes = contact?.notes ?? [];
  const noteCount = contact?._count.notes ?? 0;
  const notesHtml = notes.length
    ? notes
        .map((note) => {
          const author = [note.user?.firstName, note.user?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
          const meta = [formatDate(note.createdAt), author]
            .filter(Boolean)
            .join(" · ");
          return `
        <p style="margin:0;color:#737373;font-size:13px;">${escapeHtml(meta)}</p>
        <p style="margin:0 0 12px;white-space:pre-wrap;">${escapeHtml(truncate(note.content.trim(), NOTE_MAX_CHARS))}</p>`;
        })
        .join("")
    : `<p style="margin:0;color:#737373;">${contact ? "No notes on this contact yet." : "This number is not saved as a contact."}</p>`;
  const moreNotes =
    contactUrl && noteCount > notes.length
      ? `<p style="margin:0;"><a href="${escapeHtml(contactUrl)}">See all ${noteCount} notes</a></p>`
      : "";
  // A hidden caller nobody linked to a contact has nothing more to show.
  const details =
    contact || phone
      ? `
        <p style="margin:24px 0 4px;font-weight:600;">Contact</p>
        <table style="border-collapse:collapse;">${rows}</table>
        ${contactUrl ? `<p style="margin:8px 0 0;"><a href="${escapeHtml(contactUrl)}">Open the contact in Ringee</a></p>` : ""}
        <p style="margin:24px 0 4px;font-weight:600;">Notes</p>
        ${notesHtml}
        ${moreNotes}`
      : "";

  return `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#171717;max-width:560px;">
        <p>${lead}${line}${workspace} and nobody picked up. ${next}</p>
        ${callBackUrl ? `<p><a href="${escapeHtml(callBackUrl)}">Call ${escapeHtml(who ?? "them")} back</a></p>` : ""}
        ${details}
        <p style="margin-top:24px;color:#737373;font-size:13px;">${
          team
            ? "You get this email when a call to your team goes unanswered and there's no one person to send it to."
            : "You get this email when a call that was for you goes unanswered."
        }</p>
      </div>
    `;
}

function primaryAddress(user: UserWithEmails | null): string | null {
  return (
    (user?.emails?.find((e) => e.isPrimary)?.email ?? user?.emails?.[0]?.email)
      ?.trim()
      .toLowerCase() || null
  );
}

/** The provider's answer for a send it took: not a refusal, not an error. */
function wasAccepted(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  if ("sent" in result && result.sent === false) return false;
  if ("error" in result && result.error) return false;
  return true;
}

/** The contact's name, when the workspace knows one. */
function callerName(view: MissedCallView): string | null {
  const contact = view.contact;
  if (!contact) return null;
  return (
    contact.name?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    null
  );
}

function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
